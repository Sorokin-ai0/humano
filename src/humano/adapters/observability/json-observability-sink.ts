import type { HumanoConfig } from "../../config/schema";
import type { ObservabilitySink } from "../../ports/contracts";

/** Emits content-free structured events suitable for a future dashboard sink. */
export class JsonObservabilitySink implements ObservabilitySink {
  constructor(private readonly config: HumanoConfig["observability"]) {}

  emit(
    event: string,
    attributes: Record<string, string | number | boolean | null>,
  ): void {
    if (!this.config.enabled) return;
    console.info(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: this.config.logLevel,
        service: "humano-1",
        event,
        ...attributes,
      }),
    );
  }
}
