export const researchPreviewConsentVersion =
  "research-preview-2026-07-30-v2-liability";
export const researchPreviewCookieName = "humano_research_consent";

interface CloudflareRequest extends Request {
  cf?: {
    country?: string;
  };
}

export function requestCountry(request: Request): string | null {
  const cloudflareCountry = (request as CloudflareRequest).cf?.country;
  const headerCountry = request.headers.get("CF-IPCountry");
  const vercelCountry = request.headers.get("x-vercel-ip-country");
  return (
    cloudflareCountry ??
    headerCountry ??
    vercelCountry
  )?.toUpperCase() ?? null;
}

export function isUnitedStatesRequest(request: Request): boolean {
  const country = requestCountry(request);
  if (country) return country === "US";

  // Vercel does not guarantee a geolocation header on every preview or
  // proxied request. The preview's explicit U.S. and no-VPN attestations
  // remain required when the hosting layer cannot establish a country.
  return true;
}

export function hasResearchPreviewConsent(request: Request): boolean {
  return researchConsentReceiptId(request) !== null;
}

export function researchConsentReceiptId(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const value = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${researchPreviewCookieName}=`))
    ?.slice(researchPreviewCookieName.length + 1);
  if (!value) return null;
  const prefix = `${researchPreviewConsentVersion}.`;
  if (!value.startsWith(prefix)) return null;
  const receiptId = value.slice(prefix.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    receiptId,
  )
    ? receiptId
    : null;
}

export async function requireResearchPreviewAccess(
  request: Request,
  verifyReceipt: (
    receiptId: string,
    consentVersion: string,
  ) => Promise<boolean>,
): Promise<Response | null> {
  if (!isUnitedStatesRequest(request)) {
    return Response.json(
      {
        error: {
          code: "RESEARCH_PREVIEW_REGION_RESTRICTED",
          message:
            "The Humano research preview is currently limited to eligible adults in the United States using a direct connection.",
        },
      },
      {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  const receiptId = researchConsentReceiptId(request);
  if (
    !receiptId ||
    !(await verifyReceipt(receiptId, researchPreviewConsentVersion))
  ) {
    return Response.json(
      {
        error: {
          code: "RESEARCH_PREVIEW_CONSENT_REQUIRED",
          message: "Research preview agreement is required.",
        },
      },
      {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  return null;
}

export function consentCookie(
  request: Request,
  receiptId: string,
): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${researchPreviewCookieName}=${researchPreviewConsentVersion}.${receiptId}; Path=/; Max-Age=15552000; HttpOnly; SameSite=Strict${secure}`;
}

export function clearedConsentCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${researchPreviewCookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure}`;
}
