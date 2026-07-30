import { z } from "zod";
import { getHumanoRuntime } from "@/src/humano/bootstrap/create-humano-runtime";
import type { SubjectId } from "@/src/humano/domain/types";
import {
  errorResponse,
  isAllowedOrigin,
} from "@/src/humano/http/http-guards";
import {
  clearedConsentCookie,
  researchConsentReceiptId,
  researchPreviewConsentVersion,
} from "@/src/humano/http/research-preview-access";

const deletionSchema = z.object({
  subjectId: z.string().uuid(),
  confirmed: z.literal(true),
});

/** Deletes all product records for the current anonymous browser subject. */
export async function DELETE(request: Request) {
  const runtime = getHumanoRuntime();
  if (!isAllowedOrigin(request, runtime.config.security)) {
    return Response.json(
      { error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin not allowed." } },
      { status: 403 },
    );
  }

  try {
    const body = deletionSchema.parse(await request.json());
    const receiptId = researchConsentReceiptId(request);
    if (
      !receiptId ||
      !(await runtime.repository.hasResearchConsentForSubject(
        receiptId,
        researchPreviewConsentVersion,
        body.subjectId as SubjectId,
      ))
    ) {
      return Response.json(
        {
          error: {
            code: "RESEARCH_PREVIEW_CONSENT_REQUIRED",
            message: "Your preview agreement could not be verified.",
          },
        },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    await runtime.engine.deleteAllSubjectData(body.subjectId as SubjectId);
    return Response.json(
      { deleted: true },
      {
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": clearedConsentCookie(request),
        },
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: { code: "INVALID_DELETION_REQUEST", message: "Confirm deletion to continue." } },
        { status: 400 },
      );
    }
    return errorResponse(error);
  }
}
