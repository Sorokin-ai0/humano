import { runtimeHealth } from "@/src/humano/bootstrap/create-humano-runtime";

export async function GET() {
  const health = runtimeHealth();
  const ready = health.databaseConfigured && health.keyConfigured;
  return Response.json(
    {
      status: ready ? "ready" : "needs_configuration",
    },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
