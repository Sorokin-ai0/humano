import assert from "node:assert/strict";
import test from "node:test";
import { loadHumanoConfig } from "../../src/humano/config/load-config";
import { OpenRouterProvider } from "../../src/humano/adapters/model/openrouter-provider";
import type { TraceId } from "../../src/humano/domain/types";

test(
  "live OpenRouter response is short and contains no reasoning tags",
  { skip: process.env.RUN_LIVE_MODEL_TESTS !== "1" },
  async () => {
    const key = process.env.OPENROUTER_API_KEY;
    assert.ok(key, "OPENROUTER_API_KEY is required for the live test");
    const config = loadHumanoConfig();
    const provider = new OpenRouterProvider(key, config.provider);
    const result = await provider.generate({
      modelVariant: "humano-1",
      messages: [
        {
          role: "system",
          content:
            "You are Humano-1. Answer naturally in one short sentence. Do not output reasoning.",
        },
        { role: "user", content: "Why does rain smell good?" },
      ],
      maxOutputTokens: 80,
      temperature: 0.7,
      topP: 0.9,
      topK: 20,
      frequencyPenalty: 0,
      presencePenalty: 0,
      traceId: "live-smoke" as TraceId,
    });

    assert.ok(result.content.length > 0);
    assert.doesNotMatch(result.content, /<\/?think>/i);
  },
);
