import type { ObservabilitySink } from "../../ports/contracts";

export class NoopObservabilitySink implements ObservabilitySink {
  emit(): void {}
}
