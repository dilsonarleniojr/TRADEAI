# -*- coding: utf-8 -*-
"""
TradeAI - Ferramentas do agente de sinais (Tool Use) ligadas aos motores reais.

Substitui o antigo gateway "MDSkills": o MDSkills é uma biblioteca de SKILL.md em markdown e não tem
API HTTP, e o fallback antigo devolvia números fixos de BTC para qualquer par.

Cada ferramenta lê dados reais da Binance (candles, livro L2, funding, ticker 24h) com limite rígido
de 3s. Falhas nunca lançam exceção para o loop: viram {"error": ...} para o LLM e status "failed"
na telemetria. Nenhum valor é inventado.
"""

import asyncio
import time
from dataclasses import dataclass, asdict, field
from typing import Any, Dict, List, Optional, Tuple

import aiohttp

from indicator_engine import IncrementalIndicatorEngine

TOOL_TIMEOUT_SECONDS = 3.0
MIN_RISK_REWARD_THRESHOLD = 2.0
BINANCE = "https://api.binance.com"
BINANCE_FUTURES = "https://fapi.binance.com"
INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"]


class ToolDataError(Exception):
    """Dados indisponíveis ou inválidos: a ferramenta falhou sem produzir dados."""


@dataclass
class ToolInvocation:
    name: str
    label: str
    status: str  # "success" | "fallback" | "failed"
    duration_ms: int
    args: Dict[str, Any] = field(default_factory=dict)
    summary: Optional[str] = None
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v is not None}


# ==============================================================================
# Declarações das ferramentas (formato neutro -> Gemini / OpenAI)
# ==============================================================================
AGENT_TOOL_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "name": "trend_momentum_analysis",
        "label": "Tendência & Momentum",
        "description": "Busca candles reais da Binance e calcula EMA 12/26, MACD, RSI(14) e ATR com o motor incremental. Use para avaliar tendência e momentum.",
        "parameters": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Par, ex: BTCUSDT"},
                "interval": {"type": "string", "enum": INTERVALS, "description": "Tempo gráfico"},
            },
            "required": ["symbol", "interval"],
        },
    },
    {
        "name": "order_book_liquidity",
        "label": "Livro de Ofertas L2",
        "description": "Lê o livro de ofertas L2 real (20 níveis): spread, volume de bids/asks e desequilíbrio de fluxo (OFI, -1 a +1).",
        "parameters": {
            "type": "object",
            "properties": {"symbol": {"type": "string", "description": "Par, ex: BTCUSDT"}},
            "required": ["symbol"],
        },
    },
    {
        "name": "market_context",
        "label": "Funding & Scanner 24h",
        "description": "Funding rate real dos futuros perpétuos e estatísticas 24h do par, com a posição no ranking de volume do scanner de pares USDT.",
        "parameters": {
            "type": "object",
            "properties": {"symbol": {"type": "string", "description": "Par, ex: BTCUSDT"}},
            "required": ["symbol"],
        },
    },
    {
        "name": "trade_risk_evaluation",
        "label": "Avaliação de Risco",
        "description": "Valida um plano de trade: R:R real, distância do stop em múltiplos de ATR (1h). Use antes de propor BUY ou SELL.",
        "parameters": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Par, ex: BTCUSDT"},
                "side": {"type": "string", "enum": ["BUY", "SELL"]},
                "entry_price": {"type": "number"},
                "stop_loss": {"type": "number"},
                "take_profit": {"type": "number"},
            },
            "required": ["symbol", "side", "entry_price", "stop_loss", "take_profit"],
        },
    },
]

TOOL_LABELS = {t["name"]: t["label"] for t in AGENT_TOOL_DEFINITIONS}


def get_gemini_tools_declaration() -> List[Dict[str, Any]]:
    return [{
        "function_declarations": [
            {"name": t["name"], "description": t["description"], "parameters": t["parameters"]}
            for t in AGENT_TOOL_DEFINITIONS
        ]
    }]


def get_openai_tools_declaration() -> List[Dict[str, Any]]:
    return [
        {"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["parameters"]}}
        for t in AGENT_TOOL_DEFINITIONS
    ]


# ==============================================================================
# Helpers
# ==============================================================================
def _clean_symbol(raw: Any) -> str:
    s = "".join(ch for ch in str(raw or "").upper() if ch.isalnum())
    if not s:
        raise ToolDataError("symbol ausente")
    return s if s.endswith("USDT") else f"{s}USDT"


async def _get_json(session: aiohttp.ClientSession, url: str) -> Any:
    async with session.get(url) as resp:
        if resp.status != 200:
            raise ToolDataError(f"HTTP {resp.status} em {url.split('?')[0].replace(BINANCE, '').replace(BINANCE_FUTURES, '')}")
        return await resp.json()


async def _klines(session: aiohttp.ClientSession, symbol: str, interval: str) -> List[List[float]]:
    raw = await _get_json(session, f"{BINANCE}/api/v3/klines?symbol={symbol}&interval={interval}&limit=200")
    if not isinstance(raw, list) or not raw:
        raise ToolDataError("Binance não retornou candles")
    # [open, high, low, close, volume]
    return [[float(k[1]), float(k[2]), float(k[3]), float(k[4]), float(k[5])] for k in raw]


def _replay(klines: List[List[float]]) -> Dict[str, float]:
    engine = IncrementalIndicatorEngine()
    state: Dict[str, float] = {}
    for _o, h, l, c, _v in klines:
        state = engine.update(c, h, l)
    return state


# ==============================================================================
# Ferramentas
# ==============================================================================
async def _trend_momentum(session, args) -> Tuple[str, Dict[str, Any], str]:
    symbol = _clean_symbol(args.get("symbol"))
    interval = args.get("interval") if args.get("interval") in INTERVALS else "1h"
    klines = await _klines(session, symbol, interval)
    ind = _replay(klines)
    last = klines[-1][3]
    if last > ind["ema_fast"] > ind["ema_slow"]:
        trend = "ALTA"
    elif last < ind["ema_fast"] < ind["ema_slow"]:
        trend = "BAIXA"
    else:
        trend = "LATERAL"
    status = "success" if len(klines) >= 60 else "fallback"
    data = {
        "symbol": symbol,
        "interval": interval,
        "candles": len(klines),
        "last_close": last,
        "ema_12": round(ind["ema_fast"], 6),
        "ema_26": round(ind["ema_slow"], 6),
        "macd_hist": round(ind["macd_hist"], 6),
        "rsi_14": round(ind["rsi"], 2),
        "atr": round(ind["atr"], 6),
        "atr_relative_percent": round(ind["atr"] / last * 100, 3) if last else None,
        "trend": trend,
    }
    if status == "fallback":
        data["warning"] = "Histórico curto: indicadores pouco confiáveis"
    return status, data, f"{trend} · RSI {ind['rsi']:.1f}"


async def _order_book(session, args) -> Tuple[str, Dict[str, Any], str]:
    symbol = _clean_symbol(args.get("symbol"))
    depth = await _get_json(session, f"{BINANCE}/api/v3/depth?symbol={symbol}&limit=20")
    bids = [(float(p), float(q)) for p, q in depth.get("bids", [])]
    asks = [(float(p), float(q)) for p, q in depth.get("asks", [])]
    if not bids or not asks:
        raise ToolDataError("Livro de ofertas vazio")
    best_bid, best_ask = bids[0][0], asks[0][0]
    bid_vol = sum(p * q for p, q in bids)
    ask_vol = sum(p * q for p, q in asks)
    total = bid_vol + ask_vol
    ofi = (bid_vol - ask_vol) / total if total else 0.0
    mid = (best_bid + best_ask) / 2
    spread_pct = (best_ask - best_bid) / mid * 100 if mid else 0.0
    data = {
        "symbol": symbol,
        "best_bid": best_bid,
        "best_ask": best_ask,
        "spread_percent": round(spread_pct, 6),
        "bid_notional_usdt": round(bid_vol, 2),
        "ask_notional_usdt": round(ask_vol, 2),
        "buyer_percent": round(bid_vol / total * 100, 1) if total else 50.0,
        "order_flow_imbalance": round(ofi, 3),
    }
    return "success", data, f"OFI {ofi:+.2f} · spread {spread_pct:.4f}%"


async def _market_context(session, args) -> Tuple[str, Dict[str, Any], str]:
    symbol = _clean_symbol(args.get("symbol"))
    funding, tickers = await asyncio.gather(
        _get_json(session, f"{BINANCE_FUTURES}/fapi/v1/premiumIndex?symbol={symbol}"),
        _get_json(session, f"{BINANCE}/api/v3/ticker/24hr"),
        return_exceptions=True,
    )
    data: Dict[str, Any] = {"symbol": symbol}
    missing: List[str] = []

    if isinstance(funding, dict) and "lastFundingRate" in funding:
        data["funding_rate_percent"] = round(float(funding["lastFundingRate"]) * 100, 4)
    else:
        missing.append("funding (par sem perpétuo ou API indisponível)")

    if isinstance(tickers, list):
        usdt = sorted(
            (t for t in tickers if str(t.get("symbol", "")).endswith("USDT")),
            key=lambda t: float(t.get("quoteVolume", 0)),
            reverse=True,
        )
        own = next((t for t in usdt if t["symbol"] == symbol), None)
        if own:
            data.update({
                "price_change_percent_24h": float(own["priceChangePercent"]),
                "last_price": float(own["lastPrice"]),
                "volume_24h": float(own["volume"]),
                "quote_volume_24h_usdt": round(float(own["quoteVolume"]), 0),
                "high_24h": float(own["highPrice"]),
                "low_24h": float(own["lowPrice"]),
                "volume_rank_usdt_pairs": usdt.index(own) + 1,
                "usdt_pairs_ranked": len(usdt),
            })
        else:
            missing.append("par não encontrado no scanner 24h")
    else:
        missing.append("scanner 24h")

    if len(missing) == 2:
        raise ToolDataError("; ".join(missing))
    if missing:
        data["missing"] = missing
    parts = []
    if "funding_rate_percent" in data:
        parts.append(f"funding {data['funding_rate_percent']:+.4f}%")
    if "volume_rank_usdt_pairs" in data:
        parts.append(f"rank vol #{data['volume_rank_usdt_pairs']}")
    return ("fallback" if missing else "success"), data, " · ".join(parts)


async def _trade_risk(session, args) -> Tuple[str, Dict[str, Any], str]:
    symbol = _clean_symbol(args.get("symbol"))
    side = "SELL" if args.get("side") == "SELL" else "BUY"
    try:
        entry, sl, tp = float(args["entry_price"]), float(args["stop_loss"]), float(args["take_profit"])
    except (KeyError, TypeError, ValueError):
        raise ToolDataError("entry_price, stop_loss e take_profit devem ser números")
    if min(entry, sl, tp) <= 0:
        raise ToolDataError("preços devem ser positivos")
    geometry_ok = (sl < entry < tp) if side == "BUY" else (tp < entry < sl)
    risk, reward = abs(entry - sl), abs(tp - entry)
    rr = round(reward / risk, 2) if risk > 0 else 0.0  # mesmo arredondamento do gatekeeper
    data: Dict[str, Any] = {
        "symbol": symbol,
        "side": side,
        "geometry_valid": geometry_ok,
        "risk_reward_ratio": round(rr, 2),
        "stop_distance_percent": round(risk / entry * 100, 3),
        "passes_min_rr": geometry_ok and rr >= MIN_RISK_REWARD_THRESHOLD,
    }
    status = "success"
    try:
        atr = _replay(await _klines(session, symbol, "1h"))["atr"]
        data["atr_1h"] = round(atr, 6)
        data["stop_in_atr_multiples"] = round(risk / atr, 2) if atr > 0 else None
    except (ToolDataError, aiohttp.ClientError, asyncio.TimeoutError):
        status = "fallback"
        data["atr_1h"] = None
    summary = f"R:R {rr:.2f}{' ✓' if rr >= MIN_RISK_REWARD_THRESHOLD else ' < 2'}" if geometry_ok else "SL/TP no lado errado"
    return status, data, summary


_IMPLS = {
    "trend_momentum_analysis": _trend_momentum,
    "order_book_liquidity": _order_book,
    "market_context": _market_context,
    "trade_risk_evaluation": _trade_risk,
}


async def execute_agent_tool(
    name: str,
    args: Dict[str, Any],
    timeout_seconds: float = TOOL_TIMEOUT_SECONDS,
    session: Optional[aiohttp.ClientSession] = None,
) -> Tuple[ToolInvocation, Dict[str, Any]]:
    """Executa uma ferramenta com limite rígido. Nunca lança: falhas viram resultado de erro."""
    started = time.perf_counter()
    label = TOOL_LABELS.get(name, name)
    impl = _IMPLS.get(name)

    def elapsed() -> int:
        return int((time.perf_counter() - started) * 1000)

    if impl is None:
        error = f"Ferramenta desconhecida: {name}"
        return ToolInvocation(name, label, "failed", 0, args, error=error), {"error": error}

    own_session = session is None
    if own_session:
        session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout_seconds))
    try:
        status, data, summary = await asyncio.wait_for(impl(session, args), timeout=timeout_seconds)
        return ToolInvocation(name, label, status, elapsed(), args, summary=summary), {"status": status, **data}
    except asyncio.TimeoutError:
        error = f"timeout de {timeout_seconds:g}s"
    except (ToolDataError, aiohttp.ClientError, ValueError, KeyError, TypeError) as e:
        error = str(e) or e.__class__.__name__
    finally:
        if own_session:
            await session.close()
    return (
        ToolInvocation(name, label, "failed", elapsed(), args, error=error),
        {"error": f"{name} falhou ({error}). Não invente estes dados: use outra ferramenta ou decida HOLD."},
    )
