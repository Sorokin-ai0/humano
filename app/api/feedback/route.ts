import { z } from "zod";
import { getHumanoRuntime } from "@/src/humano/bootstrap/create-humano-runtime";
import type { SessionId, TurnId } from "@/src/humano/domain/types";
import {
  errorResponse,
  isAllowedOrigin,
} from "@/src/humano/http/http-guards";
import { requireResearchPreviewAccess } from "@/src/humano/http/research-preview-access";

const feedbackSchema = z.object({
  sessionId: z.string().uuid(),
  turnId: z.string().uuid(),
  rating: z.enum(["positive", "negative"]),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const body = feedbackSchema.parse(await request.json());
    const runtime = getHumanoRuntime();
    if (!isAllowedOrigin(request, runtime.config.security)) {
      return Response.json(
        { error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin not allowed." } },
        { status: 403 },
      );
    }
    const researchAccessError = await requireResearchPreviewAccess(request);
    if (researchAccessError) return researchAccessError;
    await runtime.engine.recordFeedback({
      sessionId: body.sessionId as SessionId,
      turnId: body.turnId as TurnId,
      rating: body.rating,
      note: body.note,
    });
    return Response.json(
      { recorded: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: { code: "INVALID_FEEDBACK", message: "Invalid feedback." } },
        { status: 400 },
      );
    }
    return errorResponse(error);
  }
}
