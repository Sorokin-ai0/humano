import type { HumanoConfig } from "../../config/schema";
import type {
  EmotionAssessment,
  EmotionLabel,
} from "../../domain/types";
import type { EmotionEngine } from "../../ports/contracts";
import {
  clamp,
  includesAny,
  roundScore,
  stripQuotedAndCode,
} from "../../core/text";

const labels: EmotionLabel[] = [
  "frustration",
  "excitement",
  "confusion",
  "curiosity",
  "sadness",
  "urgency",
  "confidence",
  "uncertainty",
];

/** Multi-label, explainable detector. Scores are independent probabilities. */
export class HeuristicEmotionEngine implements EmotionEngine {
  constructor(private readonly config: HumanoConfig["emotion"]) {}

  async analyze(
    text: string,
    prior?: EmotionAssessment,
  ): Promise<EmotionAssessment> {
    const visibleText = stripQuotedAndCode(text);
    const lower = visibleText.toLocaleLowerCase();
    const signals: string[] = [];
    const probabilities = {} as Record<EmotionLabel, number>;

    for (const label of labels) {
      const baseline = this.config.baselines[label];
      const evidence: number[] = [];
      const phrases = this.config.lexicons[label];

      for (const phrase of phrases) {
        const index = lower.indexOf(phrase.toLocaleLowerCase());
        if (index < 0 || this.isNegated(lower, index)) continue;

        const explicit =
          lower.includes(`i'm ${phrase}`) ||
          lower.includes(`i am ${phrase}`) ||
          lower.includes(`i feel ${phrase}`);
        evidence.push(
          explicit
            ? this.config.explicitEvidenceWeight
            : this.config.lexicalEvidenceWeight,
        );
        signals.push(`${label}:lexical`);
      }

      if (
        label === "curiosity" &&
        (lower.trim().startsWith("why ") ||
          lower.trim().startsWith("how ") ||
          lower.includes("what if"))
      ) {
        evidence.push(0.34);
        signals.push("curiosity:question-form");
      }

      const punctuationEvidence = this.surfaceEvidence(label, visibleText);
      if (punctuationEvidence > 0) {
        evidence.push(punctuationEvidence);
        signals.push(`${label}:surface`);
      }

      let probability = 1 - (1 - baseline);
      for (const weight of evidence) {
        probability = 1 - (1 - probability) * (1 - weight);
      }

      if (
        evidence.length === 1 &&
        punctuationEvidence > 0 &&
        probability > this.config.surfaceSignalProbabilityCap
      ) {
        probability = this.config.surfaceSignalProbabilityCap;
      }

      if (prior) {
        probability =
          probability * (1 - this.config.priorTurnBlend) +
          prior.probabilities[label] * this.config.priorTurnBlend;
      }

      probabilities[label] = roundScore(
        clamp(
          probability,
          this.config.minProbability,
          this.config.maxProbability,
        ),
      );
    }

    const dominantCandidate = labels.reduce((best, label) =>
      probabilities[label] > probabilities[best] ? label : best,
    );
    const dominant =
      probabilities[dominantCandidate] >= this.config.dominantThreshold
        ? dominantCandidate
        : null;
    const lexicalSignalCount = new Set(
      signals.filter((signal) => signal.endsWith(":lexical")),
    ).size;

    return {
      schemaVersion: "1.0",
      probabilities,
      dominant,
      detectorConfidence: roundScore(
        clamp(0.38 + lexicalSignalCount * 0.1 + (text.length > 24 ? 0.08 : 0)),
      ),
      signals: [...new Set(signals)],
    };
  }

  private isNegated(text: string, matchIndex: number): boolean {
    const preceding = text.slice(Math.max(0, matchIndex - 18), matchIndex);
    return includesAny(preceding, this.config.negationPrefixes);
  }

  private surfaceEvidence(label: EmotionLabel, text: string): number {
    if (label !== "frustration" && label !== "excitement") return 0;
    const exclamations = text.match(/!/gu)?.length ?? 0;
    const capsWords = text.match(/\b[A-Z]{3,}\b/gu)?.length ?? 0;
    const signal = exclamations * 0.035 + capsWords * 0.025;
    return clamp(signal, 0, this.config.punctuationEvidenceCap);
  }
}
