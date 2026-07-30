import { z } from "zod";
import { getHumanoRuntime } from "@/src/humano/bootstrap/create-humano-runtime";
import { loadHumanoConfig } from "@/src/humano/config/load-config";
import {
  clientAddress,
  errorResponse,
  isAllowedOrigin,
} from "@/src/humano/http/http-guards";
import {
  clearedConsentCookie,
  consentCookie,
  isUnitedStatesRequest,
  requestCountry,
  researchConsentClaims,
  researchPreviewConsentVersion,
} from "@/src/humano/http/research-preview-access";

const consentSchema = z.object({
  sessionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  ageConfirmed: z.literal(true),
  unitedStatesConfirmed: z.literal(true),
  directConnectionConfirmed: z.literal(true),
  aiRiskAccepted: z.literal(true),
  policiesAccepted: z.literal(true),
  disputeTermsAccepted: z.literal(true),
});

export async function GET(request: Request) {
  const eligibleCountry = isUnitedStatesRequest(request);
  const accepted =
    eligibleCountry && (await researchConsentClaims(request)) !== null;
  return Response.json(
    {
      accepted,
      eligibleCountry,
      version: researchPreviewConsentVersion,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const config = loadHumanoConfig();
  if (!isAllowedOrigin(request, config.security)) {
    return Response.json(
      { error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin not allowed." } },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!isUnitedStatesRequest(request)) {
    return Response.json(
      {
        error: {
          code: "RESEARCH_PREVIEW_REGION_RESTRICTED",
          message:
            "This research preview is currently available only to adults in the United States using a direct connection.",
        },
      },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  let consent: z.infer<typeof consentSchema>;
  try {
    consent = consentSchema.parse(await request.json());
  } catch {
    return Response.json(
      {
        error: {
          code: "INVALID_RESEARCH_CONSENT",
          message: "Every research preview confirmation is required.",
        },
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const acceptedAt = new Date().toISOString();
    const country = requestCountry(request) ?? "LOCAL";
    const evidenceHash = await consentEvidenceHash(request, consent);
    const receiptId = crypto.randomUUID();
    await getHumanoRuntime().repository.recordResearchConsent({
      id: receiptId,
      sessionId: consent.sessionId,
      subjectId: consent.subjectId,
      consentVersion: researchPreviewConsentVersion,
      acceptedAt,
      country,
      evidenceHash,
      acceptanceMethod: "affirmative_clickwrap",
    });

    return Response.json(
      {
        accepted: true,
        version: researchPreviewConsentVersion,
        acceptedAt,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": await consentCookie(
            request,
            receiptId,
            consent.subjectId,
          ),
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  return Response.json(
    { accepted: false },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": clearedConsentCookie(request),
      },
    },
  );
}

async function consentEvidenceHash(
  request: Request,
  consent: z.infer<typeof consentSchema>,
): Promise<string> {
  const evidence = [
    researchPreviewConsentVersion,
    consent.sessionId,
    consent.subjectId,
    requestCountry(request) ?? "LOCAL",
    clientAddress(request),
    request.headers.get("User-Agent") ?? "unknown",
  ].join("|");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(evidence),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
