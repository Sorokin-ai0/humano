import assert from "node:assert/strict";
import test from "node:test";
import {
  consentCookie,
  isUnitedStatesRequest,
  requireResearchPreviewAccess,
  researchPreviewConsentVersion,
  researchPreviewCookieName,
} from "../../src/humano/http/research-preview-access";

test("research preview allows local development without location metadata", () => {
  const request = new Request("http://localhost:3005/api/consent");
  assert.equal(isUnitedStatesRequest(request), true);
});

test("research preview accepts a consented US request", () => {
  const receiptId = "11111111-1111-4111-8111-111111111111";
  const request = new Request("https://humano.example/api/chat", {
    headers: {
      "CF-IPCountry": "US",
      Cookie: `${researchPreviewCookieName}=${researchPreviewConsentVersion}.${receiptId}`,
    },
  });

  return requireResearchPreviewAccess(
    request,
    async (candidateId, candidateVersion) =>
      candidateId === receiptId &&
      candidateVersion === researchPreviewConsentVersion,
  ).then((result) => assert.equal(result, null));
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

  const verifyReceipt = async () => true;
  assert.equal(
    (await requireResearchPreviewAccess(
      outsideUnitedStates,
      verifyReceipt,
    ))?.status,
    403,
  );
  assert.equal(
    (await requireResearchPreviewAccess(missingConsent, verifyReceipt))
      ?.status,
    403,
  );
});

test("hosted consent cookies are secure and server-only", () => {
  const cookie = consentCookie(
    new Request("https://humano.example/api/consent"),
    "11111111-1111-4111-8111-111111111111",
  );

  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
});
