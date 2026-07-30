import assert from "node:assert/strict";
import test from "node:test";
import {
  consentCookie,
  requireResearchPreviewAccess,
  researchPreviewConsentVersion,
  researchPreviewCookieName,
} from "../../src/humano/http/research-preview-access";

process.env.HUMANO_CONSENT_SECRET = "unit-test-consent-signing-secret";

test("research preview accepts signed consent regardless of location metadata", async () => {
  const receiptId = "11111111-1111-4111-8111-111111111111";
  const subjectId = "22222222-2222-4222-8222-222222222222";
  const setCookie = await consentCookie(
    new Request("https://humano.example/api/consent"),
    receiptId,
    subjectId,
  );
  const request = new Request("https://humano.example/api/chat", {
    headers: {
      "CF-IPCountry": "CA",
      Cookie: setCookie.split(";")[0] ?? "",
    },
  });

  assert.equal(await requireResearchPreviewAccess(request), null);
});

test("research preview rejects a request without consent", async () => {
  const missingConsent = new Request("https://humano.example/api/chat", {
    headers: { "CF-IPCountry": "CA" },
  });
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
      Cookie: (cookie.split(";")[0] ?? "").replace(
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333",
      ),
    },
  });
  assert.equal((await requireResearchPreviewAccess(request))?.status, 403);
});
