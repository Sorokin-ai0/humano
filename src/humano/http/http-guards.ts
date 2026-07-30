import type { HumanoConfig } from "../config/schema";

export function isAllowedOrigin(
  request: Request,
  config: HumanoConfig["security"],
): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  const requestUrl = new URL(request.url);
  if (origin === requestUrl.origin) return true;
  const forwardedHost = request.headers.get("X-Forwarded-Host");
  if (forwardedHost) {
    const forwardedProtocol =
      request.headers.get("X-Forwarded-Proto") ??
      requestUrl.protocol.replace(":", "");
    if (origin === `${forwardedProtocol}://${forwardedHost}`) return true;
  }
  return config.allowedOrigins.some((allowed) => {
    if (!allowed.endsWith(":*")) return origin === allowed;
    return origin.startsWith(allowed.slice(0, -1));
  });
}

export function clientAddress(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "local"
  );
}

export function errorResponse(error: unknown): Response {
  if (
    error instanceof Error &&
    error.message === "OPENROUTER_API_KEY is required."
  ) {
    return Response.json(
      {
        error: {
          code: "MODEL_CONNECTION_NOT_CONFIGURED",
          message:
            "Humano isn't connected to its model yet. Add OPENROUTER_API_KEY to this Vercel environment and redeploy.",
        },
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  if (error instanceof Error && error.name === "ModelProviderError") {
    return Response.json(
      {
        error: {
          code: "MODEL_PROVIDER_UNAVAILABLE",
          message: error.message,
        },
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  return Response.json(
    {
      error: {
        code: "HUMANO_REQUEST_FAILED",
        message: "Humano couldn't respond right now. Please try again.",
      },
    },
    {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
