import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  AIUnavailableError,
  buildOpenAICompatibleParams,
  parseJsonLoose,
  testAIProvider,
} from "@/lib/ai-client";

describe("AI Engine Smoke & Provider Regression Tests", () => {
  const originalFetch = globalThis.fetch;
  const originalQwenKey = process.env.DASHSCOPE_API_KEY;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalQwenKey === undefined) {
      delete process.env.DASHSCOPE_API_KEY;
    } else {
      process.env.DASHSCOPE_API_KEY = originalQwenKey;
    }
  });

  it("parseJsonLoose deve extrair JSON puro, em markdown fence ou em meio a texto, e rejeitar vazio", () => {
    assert.deepEqual(parseJsonLoose('{"signal":"HOLD","confidence_score":40}'), {
      signal: "HOLD",
      confidence_score: 40,
    });

    assert.deepEqual(
      parseJsonLoose('```json\n[{"symbol":"BTCUSDT","riskReward":4.2}]\n```'),
      [{ symbol: "BTCUSDT", riskReward: 4.2 }]
    );

    assert.deepEqual(
      parseJsonLoose('Análise concluída:\n{"ok":true}\nFim.'),
      { ok: true }
    );

    assert.equal(parseJsonLoose(""), null);
    assert.equal(parseJsonLoose("Resposta sem JSON válido"), null);
  });

  it("buildOpenAICompatibleParams deve proteger Gemini 2.5+ contra truncamento por thinking tokens", () => {
    const geminiParams = buildOpenAICompatibleParams(
      {
        system: "Health check",
        messages: [{ role: "user", content: "OK" }],
        maxTokens: 16,
        effort: "low",
        jsonMode: true,
      },
      "gemini",
      "gemini-2.5-flash"
    );

    assert.ok((geminiParams.max_tokens ?? 0) >= 1024);
    assert.equal((geminiParams as { reasoning_effort?: string }).reasoning_effort, "low");
    assert.deepEqual(geminiParams.response_format, { type: "json_object" });

    const openaiParams = buildOpenAICompatibleParams(
      {
        system: "Health check",
        messages: [{ role: "user", content: "OK" }],
        maxTokens: 256,
        effort: "low",
      },
      "openai",
      "gpt-4o"
    );

    assert.equal(openaiParams.max_completion_tokens, 256);
    assert.equal(openaiParams.max_tokens, undefined);
    assert.equal((openaiParams as { reasoning_effort?: string }).reasoning_effort, undefined);
  });

  it("testAIProvider deve validar resposta não vazia e rejeitar resposta vazia com AIUnavailableError", async () => {
    process.env.DASHSCOPE_API_KEY = "sk-smoke-test-qwen-ok";

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          id: "chatcmpl-smoke-ok",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "qwen-plus",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "OK" },
              finish_reason: "stop",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )) as typeof fetch;

    const okResult = await testAIProvider("qwen");
    assert.equal(okResult.model, "qwen-plus");
    assert.ok(okResult.latencyMs >= 1);

    process.env.DASHSCOPE_API_KEY = "sk-smoke-test-qwen-empty";

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          id: "chatcmpl-smoke-empty",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "qwen-plus",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "" },
              finish_reason: "length",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )) as typeof fetch;

    await assert.rejects(
      () => testAIProvider("qwen"),
      (err: unknown) => err instanceof AIUnavailableError && err.message.includes("resposta vazia")
    );
  });
});
