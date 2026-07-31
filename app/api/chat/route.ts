import { z } from "zod";
import type { SessionId, SubjectId } from "@/src/humano/domain/types";
import {
  conversationModes,
  modelVariants,
} from "@/src/humano/domain/types";
import { getHumanoRuntime } from "@/src/humano/bootstrap/create-humano-runtime";
import {
  clientAddress,
  errorResponse,
  isAllowedOrigin,
} from "@/src/humano/http/http-guards";
import { requireResearchPreviewAccess } from "@/src/humano/http/research-preview-access";

const baseRequestSchema = z.object({
  sessionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  message: z.string().trim().min(1),
  mode: z.enum(conversationModes).default("standard"),
  modelVariant: z.enum(modelVariants).default("humano-1"),
});

export async function POST(request: Request) {
  try {
    const runtime = getHumanoRuntime();
    if (!isAllowedOrigin(request, runtime.config.security)) {
      return Response.json(
        {
          error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin not allowed." },
        },
        { status: 403 },
      );
    }
    const researchAccessError = await requireResearchPreviewAccess(request);
    if (researchAccessError) return researchAccessError;

    const limit = runtime.rateLimiter.check(
      `${clientAddress(request)}:${request.headers.get("User-Agent") ?? "unknown"}`,
    );
    if (!limit.allowed) {
      return Response.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "A few too many messages at once. Try again in a moment.",
          },
        },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        },
      );
    }

    const body = baseRequestSchema
      .extend({
        message: z
          .string()
          .trim()
          .min(1)
          .max(runtime.config.conversation.maxInputChars),
      })
      .parse(await request.json());
    const result = await runtime.engine.respond({
      sessionId: body.sessionId as SessionId,
      subjectId: body.subjectId as SubjectId,
      message: body.message,
      mode: body.mode,
      modelVariant: body.modelVariant,
    });
    return Response.json(
      {
        sessionId: result.sessionId,
        turnId: result.turnId,
        response: result.response,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Send a non-empty message within the configured limit.",
          },
        },
        { status: 400 },
      );
    }
    return errorResponse(error);
  }
}
