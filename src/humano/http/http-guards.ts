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
  void error;
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
