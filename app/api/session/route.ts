import { z } from "zod";
import { getHumanoRuntime } from "@/src/humano/bootstrap/create-humano-runtime";
import type { SessionId, SubjectId } from "@/src/humano/domain/types";
import {
  errorResponse,
  isAllowedOrigin,
} from "@/src/humano/http/http-guards";
import { requireResearchPreviewAccess } from "@/src/humano/http/research-preview-access";

const idSchema = z.string().uuid();

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sessionId = idSchema.parse(url.searchParams.get("sessionId"));
    const runtime = getHumanoRuntime();
    if (!isAllowedOrigin(request, runtime.config.security)) {
      return Response.json(
        { error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin not allowed." } },
        { status: 403 },
      );
    }
    const researchAccessError = await requireResearchPreviewAccess(request);
    if (researchAccessError) return researchAccessError;
    const turns = await runtime.engine.history(sessionId as SessionId);
    return Response.json(
      {
        turns: turns.map((turn) => ({
          id: turn.id,
          role: turn.role,
          content: turn.content,
          createdAt: turn.createdAt,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: { code: "INVALID_SESSION", message: "Invalid session." } },
        { status: 400 },
      );
    }
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const sessionId = idSchema.parse(url.searchParams.get("sessionId"));
    const subjectId = idSchema.parse(url.searchParams.get("subjectId"));
    const forget = url.searchParams.get("forget") === "true";
    const runtime = getHumanoRuntime();
    if (!isAllowedOrigin(request, runtime.config.security)) {
      return Response.json(
        { error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin not allowed." } },
        { status: 403 },
      );
    }
    const researchAccessError = await requireResearchPreviewAccess(request);
    if (researchAccessError) return researchAccessError;
    await runtime.engine.newConversation(
      sessionId as SessionId,
      subjectId as SubjectId,
    );
    if (forget) {
      await runtime.engine.forgetSubject(subjectId as SubjectId);
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: { code: "INVALID_SESSION", message: "Invalid session." } },
        { status: 400 },
      );
    }
    return errorResponse(error);
  }
}
