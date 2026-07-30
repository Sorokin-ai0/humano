import assert from "node:assert/strict";
import test from "node:test";
import {
  errorResponse,
  isAllowedOrigin,
} from "../../src/humano/http/http-guards";

const security = {
  requestsPerWindow: 24,
  rateLimitWindowMs: 60_000,
  allowedOrigins: [] as string[],
};

test("origin guard accepts same-origin requests without launch host configuration", () => {
  const request = new Request("https://humano.example/api/chat", {
    headers: { Origin: "https://humano.example" },
  });

  assert.equal(isAllowedOrigin(request, security), true);
});

test("origin guard accepts the public forwarded origin and rejects other sites", () => {
  const forwarded = new Request("http://internal-worker/api/chat", {
    headers: {
      Origin: "https://humano.example",
      "X-Forwarded-Host": "humano.example",
      "X-Forwarded-Proto": "https",
    },
  });
  const crossSite = new Request("https://humano.example/api/chat", {
    headers: { Origin: "https://attacker.example" },
  });

  assert.equal(isAllowedOrigin(forwarded, security), true);
  assert.equal(isAllowedOrigin(crossSite, security), false);
});

test("public error responses do not expose providers or credentials", async () => {
  const response = errorResponse(
    new Error("OpenRouter failed with sk-or-secret-value"),
  );
  const body = JSON.stringify(await response.json());

  assert.equal(response.status, 502);
  assert.doesNotMatch(body, /OpenRouter|sk-or-/i);
  assert.match(body, /Humano couldn't respond/i);
});

test("missing model connection returns an actionable safe error", async () => {
  const response = errorResponse(
    new Error("OPENROUTER_API_KEY is required."),
  );
  const body = JSON.stringify(await response.json());

  assert.equal(response.status, 503);
  assert.match(body, /OPENROUTER_API_KEY/);
  assert.doesNotMatch(body, /sk-or-/i);
});
