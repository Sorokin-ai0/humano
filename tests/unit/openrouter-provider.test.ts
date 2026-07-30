import assert from "node:assert/strict";
import test from "node:test";
import { loadHumanoConfig } from "../../src/humano/config/load-config";
import { OpenRouterProvider } from "../../src/humano/adapters/model/openrouter-provider";
import type { TraceId } from "../../src/humano/domain/types";

test("OpenRouter adapter maps the provider-neutral request and disables reasoning", async () => {
  const config = loadHumanoConfig();
  let capturedAuthorization = "";
  let capturedBody: Record<string, unknown> = {};
  const fetcher: typeof fetch = async (_input, init) => {
    capturedAuthorization = new Headers(init?.headers).get("Authorization") ?? "";
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json(
      {
        id: "generation-1",
        model: "qwen/qwen3-8b",
        choices: [
          {
            message: {
              role: "assistant",
              content: "A concise answer.",
              reasoning: "must not surface",
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 4,
          total_tokens: 16,
        },
      },
      { headers: { "X-Generation-Id": "generation-1" } },
    );
  };
  const provider = new OpenRouterProvider(
    "test-server-key",
    { ...config.provider, maxRetries: 0 },
    fetcher,
  );
  const result = await provider.generate({
    modelVariant: "humano-1",
    messages: [
      { role: "system", content: "System" },
      { role: "user", content: "Question" },
    ],
    maxOutputTokens: 120,
    temperature: 0.7,
    topP: 0.9,
    topK: 20,
    frequencyPenalty: 0,
    presencePenalty: 0,
    traceId: "trace-1" as TraceId,
  });

  assert.equal(capturedAuthorization, "Bearer test-server-key");
  assert.equal(capturedBody.model, "qwen/qwen3-8b");
  assert.deepEqual(capturedBody.reasoning, { enabled: false });
  assert.equal(result.content, "A concise answer.");
  assert.equal(result.usage.totalTokens, 16);
  assert.doesNotMatch(JSON.stringify(result), /must not surface|test-server-key/);
});

test("OpenRouter adapter retries a temporary provider limit and honors Retry-After", async () => {
  const config = loadHumanoConfig();
  let requests = 0;
  const fetcher: typeof fetch = async () => {
    requests += 1;
    if (requests === 1) {
      return Response.json(
        { error: { message: "rate limited" } },
        { status: 429, headers: { "Retry-After": "0" } },
      );
    }
    return Response.json({
      choices: [{ message: { content: "Recovered." }, finish_reason: "stop" }],
      usage: { total_tokens: 2 },
    });
  };
  const provider = new OpenRouterProvider(
    "test-server-key",
    {
      ...config.provider,
      maxRetries: 2,
      retryBaseDelayMs: 0,
      retryMaxDelayMs: 1,
    },
    fetcher,
  );

  const result = await provider.generate({
    modelVariant: "humano-1",
    messages: [{ role: "user", content: "Hello" }],
    maxOutputTokens: 20,
    temperature: 0.7,
    topP: 0.9,
    topK: 20,
    frequencyPenalty: 0,
    presencePenalty: 0,
    traceId: "trace-retry" as TraceId,
  });

  assert.equal(requests, 2);
  assert.equal(result.content, "Recovered.");
});

test("OpenRouter adapter routes H1 to its fast configured model", async () => {
  const config = loadHumanoConfig();
  let capturedModel = "";
  const fetcher: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { model?: string };
    capturedModel = body.model ?? "";
    return Response.json({
      choices: [{ message: { content: "Counter-case." }, finish_reason: "stop" }],
      usage: { total_tokens: 2 },
    });
  };
  const provider = new OpenRouterProvider(
    "test-server-key",
    { ...config.provider, maxRetries: 0 },
    fetcher,
  );

  await provider.generate({
    modelVariant: "h1",
    messages: [{ role: "user", content: "Answer quickly." }],
    maxOutputTokens: 40,
    temperature: 0.7,
    topP: 0.9,
    topK: 20,
    frequencyPenalty: 0,
    presencePenalty: 0,
    traceId: "trace-debate" as TraceId,
  });

  assert.equal(capturedModel, config.provider.models.h1);
});
