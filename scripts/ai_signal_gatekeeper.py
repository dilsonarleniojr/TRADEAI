"""
TradeAI - Motor Agnóstico de Inteligência Artificial Quantitativa & Gatekeeper HFT
Módulo de Padronização Estrita de Payload de IA, Enriquecimento de Fluxo e Trava de Risco
"""

import json
import logging
import re
from dataclasses import dataclass, asdict
from typing import Dict, Any, Optional

logger = logging.getLogger("AISignalGatekeeper")

# ==============================================================================
# 1. System Prompt Padronizado e Estrito (Proibição Total de Texto Livre)
# ==============================================================================
SYSTEM_PROMPT_STRICT_HFT = """Você é um motor quantitativo HFT de análise de microestrutura e liquidez de criptoativos.
PROIBIÇÃO ABSOLUTA: Não gere saudações, preâmbulos, conclusões, explicações em parágrafos ou qualquer texto livre fora do formato solicitado.
Você DEVE retornar EXCLUSIVAMENTE uma estrutura JSON válida contendo EXATAMENTE estes campos:
{
  "signal": "BUY" | "SELL" | "HOLD",
  "confidence_score": <inteiro de 0 a 100>,
  "risk_reward_ratio": <número decimal representando a assimetria, ex: 2.5>,
  "key_driver": "<string curta com no máximo 10 palavras descrevendo o gatilho principal>",
  "risk_warning": "<string curta com no máximo 10 palavras apontando a maior ameaça>",
  "stop_loss": <número decimal com o preço sugerido de stop loss>,
  "take_profit": <número decimal com o preço sugerido de take profit>
}

REGRAS ESTRITAS:
- "signal": Apenas "BUY", "SELL" ou "HOLD".
- "confidence_score": Apenas número inteiro entre 0 e 100.
- "risk_reward_ratio": Razão matemática (|take_profit - price| / |price - stop_loss|). Se for desfavorável (< 2.0), use "HOLD".
- "key_driver": Máximo 10 palavras. Descreva estritamente o gatilho técnico ou desequilíbrio de fluxo.
- "risk_warning": Máximo 10 palavras. Aponte a barreira de liquidez ou risco imediato.
- Para "BUY": stop_loss DEVE ser abaixo do preço e take_profit DEVE ser acima do preço.
- Para "SELL": stop_loss DEVE ser acima do preço e take_profit DEVE ser abaixo do preço.
- Para "HOLD": stop_loss e take_profit devem ser iguais ao preço atual.
"""

MIN_RISK_REWARD_THRESHOLD: float = 2.0


@dataclass
class AISignalPayload:
    signal: str  # "BUY", "SELL", "HOLD"
    confidence_score: int  # 0..100
    risk_reward_ratio: float  # Ex: 2.5
    key_driver: str  # <= 10 palavras
    risk_warning: str  # <= 10 palavras
    stop_loss: float
    take_profit: float
    vetoed: bool = False
    veto_reason: Optional[str] = None
    # Falha de sistema (LLM indisponível, resposta inválida): o sinal é HOLD e não pode virar ordem.
    agent_error: bool = False
    error_reason: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ==============================================================================
# 2. Enriquecimento de Contexto no Backend (Métricas de Fluxo e Microestrutura)
# ==============================================================================
def prepare_enriched_ai_payload(
    symbol: str,
    price: float,
    volume: float,
    quote_volume: float,
    high_24h: float,
    low_24h: float,
    order_flow_imbalance: float = 0.0,
    buyer_percent: float = 50.0,
    seller_percent: float = 50.0,
    funding_rate_percent: float = 0.01,
) -> Dict[str, Any]:
    """
    Enriquece os inputs com métricas de fluxo institucional:
    - Distância do preço atual para o VWAP
    - Desequilíbrio do livro de ofertas (Order Flow Imbalance)
    - Dominância da liquidez no book L2
    - Taxa de financiamento (Funding Rate)
    """
    # Cálculo de VWAP
    if volume > 0 and quote_volume > 0:
        vwap = quote_volume / volume
    elif high_24h > 0 and low_24h > 0:
        vwap = (high_24h + low_24h + price) / 3.0
    else:
        vwap = price

    vwap_distance_percent = ((price - vwap) / vwap * 100.0) if vwap > 0 else 0.0

    if order_flow_imbalance > 0.15 or buyer_percent > 55.0:
        liquidity_controller = "Compradores agressivos controlando o book"
    elif order_flow_imbalance < -0.15 or seller_percent > 55.0:
        liquidity_controller = "Vendedores institucionais pressionando o book"
    else:
        liquidity_controller = "Liquidez neutra equilibrada"

    user_prompt = (
        f"DADOS DE MERCADO E MICROESTRUTURA PARA {symbol}:\n"
        f"- Preço Atual: ${price:.4f}\n"
        f"- VWAP: ${vwap:.4f} (Distância para VWAP: {vwap_distance_percent:+.2f}%)\n"
        f"- Desequilíbrio do Book (OFI): {order_flow_imbalance:+.3f}\n"
        f"- Dominância no Book: Compradores {buyer_percent:.1f}% vs Vendedores {seller_percent:.1f}%\n"
        f"- Controle de Liquidez: {liquidity_controller}\n"
        f"- Funding Rate 8h: {funding_rate_percent:+.4f}%\n"
        f"- Variação 24h: Máx ${high_24h:.4f} | Mín ${low_24h:.4f}\n\n"
        f"Avalie quem controla a liquidez e responda EXCLUSIVAMENTE com o JSON padronizado."
    )

    return {
        "system_prompt": SYSTEM_PROMPT_STRICT_HFT,
        "user_prompt": user_prompt,
        "metrics": {
            "vwap": round(vwap, 4),
            "vwap_distance_percent": round(vwap_distance_percent, 2),
            "order_flow_imbalance": round(order_flow_imbalance, 3),
            "buyer_percent": round(buyer_percent, 1),
            "seller_percent": round(seller_percent, 1),
            "liquidity_controller": liquidity_controller,
            "funding_rate_percent": round(funding_rate_percent, 4),
        },
    }


def fail_safe_payload(current_price: float, reason: str) -> AISignalPayload:
    """HOLD obrigatório para qualquer falha de sistema. Um erro nunca gera BUY/SELL."""
    logger.warning(f"Fail-safe HOLD: {reason}")
    return AISignalPayload(
        signal="HOLD",
        confidence_score=0,
        risk_reward_ratio=0.0,
        key_driver="Falha do motor de IA: sinal bloqueado",
        risk_warning="Nenhuma decisão de mercado foi gerada",
        stop_loss=current_price,
        take_profit=current_price,
        agent_error=True,
        error_reason=reason,
    )


# ==============================================================================
# 3. Parsing Estrito do Payload da IA
# ==============================================================================
def parse_strict_ai_response(raw_text: str, current_price: float) -> AISignalPayload:
    """
    Realiza o parse estrito garantindo limites de palavras e tipos primitivos.
    """
    clean_text = raw_text.strip()
    match = re.search(r"\{.*\}", clean_text, re.DOTALL)
    if match:
        clean_text = match.group(0)

    try:
        data = json.loads(clean_text)
    except Exception:
        data = None
    if not isinstance(data, dict):
        return fail_safe_payload(current_price, "Resposta do LLM não é um JSON válido")

    signal = str(data.get("signal", "")).strip().upper()
    if signal not in ("BUY", "SELL", "HOLD"):
        return fail_safe_payload(current_price, 'Resposta do LLM sem campo "signal" válido')

    try:
        confidence = int(round(float(data.get("confidence_score", 50))))
        confidence = max(0, min(100, confidence))
    except (ValueError, TypeError):
        confidence = 50

    try:
        rr = float(data.get("risk_reward_ratio", 1.5))
        rr = round(rr, 2)
    except (ValueError, TypeError):
        rr = 1.5

    # Restrição de no máximo 10 palavras
    raw_driver = str(data.get("key_driver", "Análise de fluxo")).strip()
    driver_words = raw_driver.split()
    key_driver = " ".join(driver_words[:10]) if len(driver_words) > 10 else raw_driver

    raw_warning = str(data.get("risk_warning", "Volatilidade elevada")).strip()
    warning_words = raw_warning.split()
    risk_warning = " ".join(warning_words[:10]) if len(warning_words) > 10 else raw_warning

    try:
        stop_loss = float(data.get("stop_loss", current_price))
        take_profit = float(data.get("take_profit", current_price))
    except (ValueError, TypeError):
        return fail_safe_payload(current_price, "stop_loss/take_profit não numéricos")

    return AISignalPayload(
        signal=signal,
        confidence_score=confidence,
        risk_reward_ratio=rr,
        key_driver=key_driver,
        risk_warning=risk_warning,
        stop_loss=stop_loss,
        take_profit=take_profit,
    )


# ==============================================================================
# 4. Filtro Matemático de Segurança (Backend Gatekeeper / Circuit Breaker)
# ==============================================================================
def apply_backend_risk_gatekeeper(
    payload: AISignalPayload,
    min_rr_ratio: float = MIN_RISK_REWARD_THRESHOLD,
    current_price: Optional[float] = None,
) -> AISignalPayload:
    """
    Trava de segurança na camada de serviço:
    Se risk_reward_ratio < 2.0, sobrepõe a decisão da IA de forma autônoma,
    força o status para 'HOLD' e emite o log sistêmico de bloqueio.

    Com current_price informado, o R:R é recalculado a partir dos preços (o valor declarado pelo
    LLM é descartado) e stop/alvo do lado errado do preço também vetam a operação.
    """
    if payload.agent_error:
        payload.signal = "HOLD"
        return payload

    if payload.signal != "HOLD" and current_price is not None:
        price, sl, tp = current_price, payload.stop_loss, payload.take_profit
        geometry_ok = price > 0 and ((sl < price < tp) if payload.signal == "BUY" else (tp < price < sl))
        if not geometry_ok:
            logger.warning(
                f"Operação vetada: stop/alvo inconsistentes (Sinal={payload.signal}, preço={price}, SL={sl}, TP={tp})"
            )
            payload.risk_reward_ratio = 0.0
            payload.signal = "HOLD"
            payload.vetoed = True
            payload.veto_reason = "Operação vetada: stop/alvo inconsistentes com o sinal ao preço atual"
            payload.stop_loss = price
            payload.take_profit = price
            return payload
        payload.risk_reward_ratio = round(abs(tp - price) / abs(price - sl), 2)

    if payload.signal != "HOLD" and payload.risk_reward_ratio < min_rr_ratio:
        logger.warning(
            "Operação vetada pela matriz de risco: Assimetria desfavorável. "
            f"(Sinal={payload.signal}, R:R={payload.risk_reward_ratio:.2f} < {min_rr_ratio:.2f})"
        )
        payload.signal = "HOLD"
        payload.vetoed = True
        payload.veto_reason = "Operação vetada pela matriz de risco: Assimetria desfavorável"
        if current_price is not None:
            payload.stop_loss = current_price
            payload.take_profit = current_price

    return payload
