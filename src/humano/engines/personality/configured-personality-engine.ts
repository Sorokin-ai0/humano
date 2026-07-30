import type { HumanoConfig } from "../../config/schema";
import type { PersonalitySnapshot } from "../../domain/types";
import type { PersonalityEngine } from "../../ports/contracts";

/** Stable personality source; a future learned personality can replace this port. */
export class ConfiguredPersonalityEngine implements PersonalityEngine {
  constructor(private readonly config: HumanoConfig["personality"]) {}

  snapshot(): PersonalitySnapshot {
    return {
      name: this.config.name,
      description: this.config.description,
      traits: { ...this.config.traits },
      forbiddenBehaviors: [...this.config.forbiddenBehaviors],
    };
  }
}
