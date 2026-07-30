import assert from "node:assert/strict";
import test from "node:test";
import {
  consentCookie,
  isUnitedStatesRequest,
  requireResearchPreviewAccess,
  researchPreviewConsentVersion,
  researchPreviewCookieName,
} from "../../src/humano/http/research-preview-access";

process.env.HUMANO_CONSENT_SECRET = "unit-test-consent-signing-secret";

test("research preview allows local development without location metadata", () => {
  const request = new Request("http://localhost:3005/api/consent");
  assert.equal(isUnitedStatesRequest(request), true);
});

test("research preview falls back to the required user attestation when geo data is unavailable", () => {
  const request = new Request("https://humano.vercel.app/api/consent");
  assert.equal(isUnitedStatesRequest(request), true);
});

test("research preview accepts a signed consent token across requests", async () => {
  const receiptId = "11111111-1111-4111-8111-111111111111";
  const subjectId = "22222222-2222-4222-8222-222222222222";
  const setCookie = await consentCookie(
    new Request("https://humano.example/api/consent"),
    receiptId,
    subjectId,
  );
  const request = new Request("https://humano.example/api/chat", {
    headers: {
      "CF-IPCountry": "US",
      Cookie: setCookie.split(";")[0] ?? "",
    },
  });

  assert.equal(await requireResearchPreviewAccess(request), null);
});

test("research preview recognizes Vercel's US country header", () => {
  const request = new Request("https://humano.vercel.app/api/consent", {
    headers: { "x-vercel-ip-country": "US" },
  });
  assert.equal(isUnitedStatesRequest(request), true);
});

test("research preview rejects a non-US request and a request without consent", async () => {
  const outsideUnitedStates = new Request(
    "https://humano.example/api/chat",
    {
      headers: { "CF-IPCountry": "CA" },
    },
  );
  const missingConsent = new Request("https://humano.example/api/chat", {
    headers: { "CF-IPCountry": "US" },
  });

  assert.equal(
    (await requireResearchPreviewAccess(outsideUnitedStates))?.status,
    403,
  );
  assert.equal(
    (await requireResearchPreviewAccess(missingConsent))?.status,
    403,
  );
});

test("hosted consent cookies are signed, secure, and server-only", async () => {
  const cookie = await consentCookie(
    new Request("https://humano.example/api/consent"),
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  );

  assert.match(cookie, new RegExp(researchPreviewCookieName));
  assert.match(cookie, new RegExp(researchPreviewConsentVersion));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
});

test("research preview rejects a tampered signed token", async () => {
  const cookie = await consentCookie(
    new Request("https://humano.example/api/consent"),
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  );
  const request = new Request("https://humano.example/api/chat", {
    headers: {
      "CF-IPCountry": "US",
      Cookie: (cookie.split(";")[0] ?? "").replace(
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333",
      ),
    },
  });
  assert.equal((await requireResearchPreviewAccess(request))?.status, 403);
});
