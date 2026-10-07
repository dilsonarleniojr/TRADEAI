# -*- coding: utf-8 -*-
"""
Testes do agente de sinais: fail-safe (falha nunca vira BUY/SELL), telemetria das ferramentas
e gatekeeper que recalcula o R:R. O Gemini é simulado por um servidor HTTP local.
"""

import asyncio
import json
import os
import sys
import unittest

from aiohttp import web

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "scripts")))

import signal_agent_tools  # noqa: E402
from ai_signal_gatekeeper import AISignalPayload, apply_backend_risk_gatekeeper  # noqa: E402
from signal_agent_loop import SignalAgentLoop  # noqa: E402
from signal_agent_tools import AGENT_TOOL_DEFINITIONS, execute_agent_tool, get_gemini_tools_declaration  # noqa: E402

PRICE = 100.0


async def _fake_trend(session, args):
    return "success", {"symbol": args["symbol"], "rsi_14": 55.0, "trend": "ALTA"}, "ALTA · RSI 55.0"


async def _slow_tool(session, args):
    await asyncio.sleep(1.0)
    return "success", {}, ""


def _call(name, args):
    return {"candidates": [{"content": {"role": "model", "parts": [{"functionCall": {"name": name, "args": args}}]}}]}


def _text(text):
    return {"candidates": [{"content": {"role": "model", "parts": [{"text": text}]}}]}


class GeminiStub:
    """Responde em sequência: cada item é (status, corpo)."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.requests = []

    async def handler(self, request):
        self.requests.append(await request.json())
        status, body = self.replies.pop(0)
        if status != 200:
            return web.Response(status=status, text="boom")
        return web.json_response(body)

    async def __aenter__(self):
        app = web.Application()
        app.router.add_post("/{tail:.*}", self.handler)
        self.runner = web.AppRunner(app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        port = site._server.sockets[0].getsockname()[1]
        self.url = f"http://127.0.0.1:{port}/{{model}}"
        return self

    async def __aexit__(self, *exc):
        await self.runner.cleanup()


class TestTools(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self._impls = dict(signal_agent_tools._IMPLS)

    def tearDown(self):
        signal_agent_tools._IMPLS.clear()
        signal_agent_tools._IMPLS.update(self._impls)

    def test_schemas(self):
        decl = get_gemini_tools_declaration()[0]["function_declarations"]
        self.assertEqual(len(decl), len(AGENT_TOOL_DEFINITIONS))
        for d in decl:
            self.assertEqual(d["parameters"]["type"], "object")
            self.assertIn("symbol", d["parameters"]["required"])

    async def test_unknown_tool_fails_without_data(self):
        inv, res = await execute_agent_tool("mdskills_magic", {})
        self.assertEqual(inv.status, "failed")
        self.assertIn("error", res)

    async def test_tool_timeout_is_reported(self):
        signal_agent_tools._IMPLS["trend_momentum_analysis"] = _slow_tool
        inv, res = await execute_agent_tool("trend_momentum_analysis", {"symbol": "BTC"}, timeout_seconds=0.2)
        self.assertEqual(inv.status, "failed")
        self.assertIn("timeout", inv.error)
        self.assertIn("Não invente", res["error"])


class TestAgentLoop(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self._impls = dict(signal_agent_tools._IMPLS)
        signal_agent_tools._IMPLS["trend_momentum_analysis"] = _fake_trend

    def tearDown(self):
        signal_agent_tools._IMPLS.clear()
        signal_agent_tools._IMPLS.update(self._impls)

    def _agent(self, url):
        return SignalAgentLoop(gemini_api_key="test", gemini_url=url, llm_timeout_seconds=5)

    async def test_no_key_is_fail_safe_hold(self):
        r = await SignalAgentLoop(gemini_api_key="").run_agent_cycle("BTCUSDT", PRICE)
        self.assertEqual(r.payload.signal, "HOLD")
        self.assertTrue(r.payload.agent_error)
        self.assertEqual(r.mode, "fail_safe")

    async def test_missing_price_is_fail_safe_hold(self):
        r = await SignalAgentLoop(gemini_api_key="test").run_agent_cycle("BTCUSDT", 0.0)
        self.assertEqual(r.payload.signal, "HOLD")
        self.assertTrue(r.payload.agent_error)

    async def test_http_5xx_is_fail_safe_hold(self):
        async with GeminiStub([(503, None)]) as g:
            r = await self._agent(g.url).run_agent_cycle("BTCUSDT", PRICE)
        self.assertEqual(r.payload.signal, "HOLD")
        self.assertTrue(r.payload.agent_error)
        self.assertIn("503", r.payload.error_reason)

    async def test_free_text_is_fail_safe_hold(self):
        async with GeminiStub([(200, _text("Acho que vale comprar agora"))]) as g:
            r = await self._agent(g.url).run_agent_cycle("BTCUSDT", PRICE)
        self.assertEqual(r.payload.signal, "HOLD")
        self.assertTrue(r.payload.agent_error)

    async def test_tool_loop_records_telemetry_and_approves_valid_buy(self):
        final = {"signal": "BUY", "confidence_score": 80, "risk_reward_ratio": 2.5, "key_driver": "a",
                 "risk_warning": "b", "stop_loss": 98.0, "take_profit": 105.0}
        replies = [
            (200, {"candidates": [{"content": {"role": "model", "parts": [
                {"functionCall": {"name": "trend_momentum_analysis", "args": {"symbol": "BTCUSDT", "interval": "1h"}}},
                {"functionCall": {"name": "mdskills_magic", "args": {}}},
            ]}}]}),
            (200, _text(json.dumps(final))),
        ]
        async with GeminiStub(replies) as g:
            r = await self._agent(g.url).run_agent_cycle("BTCUSDT", PRICE)
            second_request = g.requests[1]
        self.assertEqual(r.payload.signal, "BUY")
        self.assertFalse(r.payload.agent_error)
        self.assertEqual(r.payload.risk_reward_ratio, 2.5)
        self.assertEqual([(t.name, t.status) for t in r.skills_invoked],
                         [("trend_momentum_analysis", "success"), ("mdskills_magic", "failed")])
        # O resultado real da ferramenta volta ao LLM
        responses = second_request["contents"][-1]["parts"]
        self.assertEqual(responses[0]["functionResponse"]["response"]["trend"], "ALTA")
        self.assertIn("error", responses[1]["functionResponse"]["response"])
        tele = r.to_dict()["agent_telemetry"]
        self.assertEqual(tele["mode"], "agent")
        self.assertEqual(len(tele["tools"]), 2)

    async def test_declared_rr_is_ignored_and_recomputed(self):
        final = {"signal": "BUY", "confidence_score": 90, "risk_reward_ratio": 9.0, "key_driver": "a",
                 "risk_warning": "b", "stop_loss": 99.0, "take_profit": 101.0}
        async with GeminiStub([(200, _text(json.dumps(final)))]) as g:
            r = await self._agent(g.url).run_agent_cycle("BTCUSDT", PRICE)
        self.assertEqual(r.payload.signal, "HOLD")
        self.assertTrue(r.payload.vetoed)
        self.assertEqual(r.payload.risk_reward_ratio, 1.0)


class TestGatekeeper(unittest.TestCase):
    def test_wrong_side_stop_is_vetoed(self):
        p = AISignalPayload("BUY", 90, 3.0, "a", "b", stop_loss=102.0, take_profit=110.0)
        r = apply_backend_risk_gatekeeper(p, current_price=PRICE)
        self.assertEqual(r.signal, "HOLD")
        self.assertTrue(r.vetoed)

    def test_agent_error_always_hold(self):
        p = AISignalPayload("BUY", 90, 3.0, "a", "b", 98.0, 110.0, agent_error=True, error_reason="x")
        self.assertEqual(apply_backend_risk_gatekeeper(p, current_price=PRICE).signal, "HOLD")


if __name__ == "__main__":
    unittest.main()
