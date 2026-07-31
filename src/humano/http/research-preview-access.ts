export const researchPreviewConsentVersion =
  "research-preview-2026-07-30-v3-signed";
export const researchPreviewCookieName = "humano_research_consent";

export interface ResearchConsentClaims {
  receiptId: string;
  subjectId: string;
}

function researchConsentCookieValue(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  return (
    cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${researchPreviewCookieName}=`))
    ?.slice(researchPreviewCookieName.length + 1) ?? null
  );
}

export async function researchConsentClaims(
  request: Request,
): Promise<ResearchConsentClaims | null> {
  const value = researchConsentCookieValue(request);
  if (!value) return null;
  const [version, receiptId, subjectId, signature, extra] = value.split(".");
  if (
    extra !== undefined ||
    version !== researchPreviewConsentVersion ||
    !isUuid(receiptId) ||
    !isUuid(subjectId) ||
    !signature
  ) {
    return null;
  }
  const expected = await signConsent(`${version}.${receiptId}.${subjectId}`);
  if (!expected || !constantTimeEqual(signature, expected)) return null;
  return { receiptId, subjectId };
}

export async function requireResearchPreviewAccess(
  request: Request,
): Promise<Response | null> {
  if (!(await researchConsentClaims(request))) {
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

export async function consentCookie(
  request: Request,
  receiptId: string,
  subjectId: string,
): Promise<string> {
  const payload = `${researchPreviewConsentVersion}.${receiptId}.${subjectId}`;
  const signature = await signConsent(payload);
  if (!signature) {
    throw new Error("Research preview signing is not configured.");
  }
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${researchPreviewCookieName}=${payload}.${signature}; Path=/; Max-Age=15552000; HttpOnly; SameSite=Strict${secure}`;
}

export function clearedConsentCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${researchPreviewCookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure}`;
}

async function signConsent(payload: string): Promise<string | null> {
  const secret =
    process.env.HUMANO_CONSENT_SECRET ?? process.env.OPENROUTER_API_KEY;
  if (!secret) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return base64Url(new Uint8Array(signature));
}

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function isUuid(value: string | undefined): value is string {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        value,
      ),
  );
}
