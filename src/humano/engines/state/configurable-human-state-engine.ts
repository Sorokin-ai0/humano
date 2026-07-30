import type { HumanoConfig } from "../../config/schema";
import { normalizeText } from "../../core/text";
import type {
  HumanStateAssessment,
  HumanStateLabel,
} from "../../domain/types";
import type { HumanStateEngine } from "../../ports/contracts";

/**
 * Recognizes ordinary human states that are not emotions: being hungry is a
 * need, for example, rather than a positive disclosure. The result is compact,
 * deterministic, and retained in the response plan as a future training target.
 */
export class ConfigurableHumanStateEngine implements HumanStateEngine {
  constructor(private readonly config: HumanoConfig["planner"]["humanState"]) {}

  async assess(
    input: Parameters<HumanStateEngine["assess"]>[0],
  ): Promise<HumanStateAssessment> {
    const text = normalizeText(input.text);
    const matchedLabels = this.config.priority.filter((label) =>
      this.matchesAny(text, this.config.states[label].patterns),
    );
    const primaryLabel = matchedLabels[0] ?? null;
    const primary = primaryLabel
      ? this.toAssessmentState(primaryLabel)
      : null;

    return {
      schemaVersion: "1.0",
      algorithmVersion: this.config.algorithmVersion,
      primary,
      matchedLabels,
      signals: matchedLabels.map((label) => `${label}:pattern`),
    };
  }

  private toAssessmentState(label: HumanStateLabel) {
    const state = this.config.states[label];
    return {
      label,
      valence: state.valence,
      responseInstruction: state.responseInstruction,
      allowFollowUp: state.allowFollowUp,
      recoveryResponses: state.recoveryResponses,
    };
  }

  private matchesAny(text: string, patterns: readonly string[]): boolean {
    const paddedText = ` ${normalizeText(text)} `;
    return patterns.some((pattern) => {
      const normalizedPattern = normalizeText(pattern);
      return (
        normalizedPattern.length > 0 &&
        paddedText.includes(` ${normalizedPattern} `)
      );
    });
  }
}
