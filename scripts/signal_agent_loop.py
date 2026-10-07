# -*- coding: utf-8 -*-
"""
TradeAI - Loop do agente de sinais (Gemini Function Calling) com telemetria.

Fluxo: o LLM recebe o contexto -> pede ferramentas -> o Python executa os motores reais
(signal_agent_tools) com limite de 3s -> os resultados voltam ao LLM -> JSON final -> gatekeeper.

Segurança:
- Sem chave, erro HTTP, timeout, JSON inválido ou limite de iterações: HOLD com agent_error=True.
  Não existe mock nem decisão simulada: uma falha de sistema nunca gera BUY/SELL.
- Ferramentas que falham são registradas em `skills_invoked` com status "failed".
"""

import logging
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import aiohttp
from dotenv import load_dotenv

from ai_signal_gatekeeper import (
    AISignalPayload,
    apply_backend_risk_gatekeeper,
    fail_safe_payload,
    parse_strict_ai_response,
)
from signal_agent_tools import ToolInvocation, execute_agent_tool, get_gemini_tools_declaration

load_dotenv()
logger = logging.getLogger("SignalAgentLoop")

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
DEFAULT_GEMINI_MODEL = "gemini-flash-lite-latest"

AGENT_SYSTEM_PROMPT = """Você é um motor quantitativo de análise de criptoativos com acesso a ferramentas que leem dados reais da Binance.
Use as ferramentas para obter tendência, livro de ofertas e contexto antes de decidir. Antes de propor BUY ou SELL, valide o plano com trade_risk_evaluation.
Se uma ferramenta falhar, NÃO invente os dados dela: decida com o que tem ou responda HOLD.

Resposta final: EXCLUSIVAMENTE um objeto JSON, sem texto fora dele:
{"signal": "BUY" | "SELL" | "HOLD", "confidence_score": <inteiro 0-100>, "risk_reward_ratio": <número>,
 "key_driver": "<no máximo 10 palavras>", "risk_warning": "<no máximo 10 palavras>",
 "stop_loss": <preço>, "take_profit": <preço>}
Regras: BUY exige stop_loss < preço < take_profit. SELL exige take_profit < preço < stop_loss. R:R abaixo de 2.0 deve ser HOLD.
Para HOLD, stop_loss e take_profit iguais ao preço atual."""


class LLMFailure(Exception):
    pass


@dataclass
class AgentResult:
    """Decisão final + telemetria do ciclo (mesmo formato do agent_telemetry da rota Next.js)."""

    payload: AISignalPayload
    skills_invoked: List[ToolInvocation] = field(default_factory=list)
    mode: str = "agent"  # "agent" | "fail_safe"
    model: Optional[str] = None
    iterations: int = 0
    started_at: str = ""
    duration_ms: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            **self.payload.to_dict(),
            "agent_telemetry": {
                "mode": self.mode,
                "provider": "gemini",
                "model": self.model,
                "iterations": self.iterations,
                "tools": [t.to_dict() for t in self.skills_invoked],
                "llm_error": self.payload.error_reason if self.mode == "fail_safe" else None,
                "started_at": self.started_at,
                "duration_ms": self.duration_ms,
            },
        }


class SignalAgentLoop:
    def __init__(
        self,
        gemini_api_key: Optional[str] = None,
        model: Optional[str] = None,
        max_iterations: int = 4,
        llm_timeout_seconds: float = 20.0,
        tool_timeout_seconds: float = 3.0,
        gemini_url: str = GEMINI_URL,
    ):
        self.gemini_api_key = gemini_api_key if gemini_api_key is not None else os.getenv("GEMINI_API_KEY", "")
        self.model = model or os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)
        self.max_iterations = max_iterations
        self.llm_timeout_seconds = llm_timeout_seconds
        self.tool_timeout_seconds = tool_timeout_seconds
        self.gemini_url = gemini_url

    async def run_agent_cycle(self, symbol: str, current_price: float, market_brief: str = "") -> AgentResult:
        started = time.perf_counter()
        result = AgentResult(
            payload=AISignalPayload("HOLD", 0, 0.0, "", "", current_price, current_price),
            model=self.model,
            started_at=datetime.now(timezone.utc).isoformat(),
        )

        def finish(payload: AISignalPayload) -> AgentResult:
            result.payload = payload
            result.mode = "fail_safe" if payload.agent_error else "agent"
            result.duration_ms = int((time.perf_counter() - started) * 1000)
            return result

        if not current_price or current_price <= 0:
            return finish(fail_safe_payload(current_price or 0.0, "Preço atual inválido ou ausente"))
        if not self.gemini_api_key:
            return finish(fail_safe_payload(current_price, "GEMINI_API_KEY ausente"))

        contents: List[Dict[str, Any]] = [{
            "role": "user",
            "parts": [{"text": (
                f"Analise {symbol} ao preço atual de {current_price}.\n{market_brief}\n"
                "Use as ferramentas antes de decidir e responda só com o JSON final."
            )}],
        }]

        final_text = ""
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=self.llm_timeout_seconds)) as session:
                for iteration in range(1, self.max_iterations + 1):
                    result.iterations = iteration
                    last = iteration == self.max_iterations
                    parts = await self._call_gemini(session, contents, with_tools=not last)
                    calls = [p["functionCall"] for p in parts if "functionCall" in p]

                    if calls and not last:
                        contents.append({"role": "model", "parts": parts})
                        responses = []
                        for call in calls:
                            name = call.get("name", "")
                            invocation, tool_result = await execute_agent_tool(
                                name, call.get("args") or {}, timeout_seconds=self.tool_timeout_seconds
                            )
                            result.skills_invoked.append(invocation)
                            logger.info(f"🔧 {name}: {invocation.status} ({invocation.duration_ms}ms)")
                            responses.append({"functionResponse": {"name": name, "response": tool_result}})
                        contents.append({"role": "user", "parts": responses})
                        continue

                    final_text = "".join(p.get("text", "") for p in parts)
                    break
        except LLMFailure as e:
            return finish(fail_safe_payload(current_price, str(e)))
        except (aiohttp.ClientError, TimeoutError) as e:
            return finish(fail_safe_payload(current_price, f"Falha de rede com o Gemini: {e or e.__class__.__name__}"))

        payload = parse_strict_ai_response(final_text, current_price=current_price)
        payload = apply_backend_risk_gatekeeper(payload, current_price=current_price)
        logger.info(
            f"🎯 {symbol}: {payload.signal} | R:R={payload.risk_reward_ratio:.2f} | "
            f"veto={payload.vetoed} | erro={payload.agent_error} | tools={[t.name + ':' + t.status for t in result.skills_invoked]}"
        )
        return finish(payload)

    async def _call_gemini(self, session: aiohttp.ClientSession, contents, with_tools: bool) -> List[Dict[str, Any]]:
        body: Dict[str, Any] = {
            "contents": contents,
            "system_instruction": {"parts": [{"text": AGENT_SYSTEM_PROMPT}]},
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 1500},
        }
        if with_tools:
            body["tools"] = get_gemini_tools_declaration()
        url = self.gemini_url.format(model=self.model)
        # Chave no header, não na URL, para não vazar em logs de acesso.
        async with session.post(url, json=body, headers={"x-goog-api-key": self.gemini_api_key}) as resp:
            if resp.status != 200:
                text = (await resp.text())[:300]
                raise LLMFailure(f"Gemini HTTP {resp.status}: {text}")
            data = await resp.json()
        candidates = data.get("candidates") or []
        if not candidates:
            raise LLMFailure(f"Gemini sem candidatos (bloqueio: {data.get('promptFeedback', {}).get('blockReason', 'desconhecido')})")
        parts = (candidates[0].get("content") or {}).get("parts") or []
        if not parts:
            raise LLMFailure(f"Gemini resposta vazia (finishReason: {candidates[0].get('finishReason')})")
        return parts
