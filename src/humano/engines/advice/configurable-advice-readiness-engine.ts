import type { HumanoConfig } from "../../config/schema";
import {
  clamp,
  countWords,
  normalizeText,
  roundScore,
} from "../../core/text";
import type {
  AdviceContextDimension,
  AdviceContextEvidence,
  AdviceDomain,
  AdviceReadinessAssessment,
  AdviceReadinessSignal,
  ConversationTurn,
} from "../../domain/types";
import type { AdviceReadinessEngine } from "../../ports/contracts";

const contextDimensions = [
  "goal",
  "current_state",
  "constraints",
  "preferences",
  "resources",
] as const satisfies readonly AdviceContextDimension[];

interface RequestDetection {
  explicit: boolean;
  implicit: boolean;
  confidence: number;
}

interface ActiveAdviceHistory {
  domain: AdviceDomain;
  texts: string[];
}

/**
 * Determines whether the next advice turn has enough user-supplied context.
 * The engine is deterministic, provider-neutral, and records only matched
 * configuration signals rather than copying private conversation text.
 */
export class ConfigurableAdviceReadinessEngine
  implements AdviceReadinessEngine
{
  constructor(
    private readonly config: HumanoConfig["planner"]["advice"],
  ) {}

  async assess(
    input: Parameters<AdviceReadinessEngine["assess"]>[0],
  ): Promise<AdviceReadinessAssessment> {
    const currentText = normalizeText(input.text);
    const currentRequest = this.detectRequest(currentText);
    const currentDomain = this.classifyDomain(currentText);
    const currentContext = this.findPresentDimensions(currentText);
    const recentUserTurns = input.history
      .filter((turn) => turn.role === "user")
      .slice(-this.config.recentUserTurnLimit);
    const activeHistory = this.findActiveAdviceHistory(recentUserTurns);
    const continuationAnswer =
      this.matchesAny(
        currentText,
        this.config.detection.continuationAnswerPatterns,
      ) ||
      this.matchesAny(
        currentText,
        this.config.detection.continuationPatterns,
      );
    const withinContinuationLimit =
      countWords(currentText) <= this.config.detection.maxContinuationWords;
    const hasContinuationEvidence =
      currentContext.length > 0 || continuationAnswer;
    const compatibleDomain =
      activeHistory === null ||
      currentDomain === activeHistory.domain ||
      (currentDomain === "general" &&
        currentRequest.confidence <
          this.config.detection.minimumRequestConfidence);
    const continuedAdviceTurn =
      activeHistory !== null &&
      withinContinuationLimit &&
      hasContinuationEvidence &&
      compatibleDomain;
    const continuationConfidence = continuedAdviceTurn
      ? this.config.detection.confidence.continued
      : 0;
    const confidence = Math.max(
      currentRequest.confidence,
      continuationConfidence,
    );
    const detected =
      confidence >= this.config.detection.minimumRequestConfidence;
    const domain =
      currentDomain === "general" && continuedAdviceTurn
        ? activeHistory.domain
        : currentDomain;
    const contextTexts = continuedAdviceTurn
      ? [...activeHistory.texts, input.text]
      : [input.text];
    const context = this.assessContext(contextTexts);
    const urgent =
      clamp(input.urgency) >= this.config.urgency.emotionThreshold ||
      this.matchesAny(currentText, this.config.urgency.patterns);
    const sufficientlyContextual =
      context.score >=
        this.config.context.readinessThresholdByDomain[domain] &&
      context.present.length >=
        this.config.context.minimumDimensionCountByDomain[domain];
    const mode = !detected
      ? "not_advice"
      : urgent
        ? "direct_guidance"
        : sufficientlyContextual
          ? "considered_opinion"
          : "clarify_first";
    const missingContext = contextDimensions.filter(
      (dimension) => !context.dimensions[dimension].present,
    );
    const questionFocus =
      mode === "clarify_first"
        ? this.selectQuestionFocus(domain, missingContext)
        : null;
    const signals: AdviceReadinessSignal[] = [];

    if (currentRequest.explicit) {
      signals.push("explicit_advice_request");
    } else if (currentRequest.implicit) {
      signals.push("implicit_advice_request");
    }
    if (continuedAdviceTurn) signals.push("continued_advice_turn");
    if (
      this.matchesAny(
        currentText,
        this.config.detection.personalizationPatterns,
      )
    ) {
      signals.push("personalized_request");
    }
    if (domain !== "general") signals.push("domain_match");
    if (detected && urgent) signals.push("urgent_request");
    if (detected) {
      signals.push(
        sufficientlyContextual
          ? "sufficient_context"
          : "insufficient_context",
      );
    }

    return {
      schemaVersion: "1.0",
      algorithmVersion: this.config.algorithmVersion,
      detected,
      domain,
      mode,
      confidence: roundScore(confidence),
      continuedAdviceTurn,
      urgent,
      missingContext,
      questionFocus,
      context: {
        score: context.score,
        dimensions: context.dimensions,
        present: context.present,
      },
      signals: [...new Set(signals)],
    };
  }

  private findActiveAdviceHistory(
    turns: ConversationTurn[],
  ): ActiveAdviceHistory | null {
    let active: ActiveAdviceHistory | null = null;

    for (const turn of turns) {
      const text = normalizeText(turn.content);
      const request = this.detectRequest(text);
      const requestDetected =
        request.confidence >= this.config.detection.minimumRequestConfidence;
      const domain = this.classifyDomain(text);

      if (requestDetected) {
        active = { domain, texts: [turn.content] };
        continue;
      }

      if (active === null || !this.isContinuationEvidence(text)) {
        active = null;
        continue;
      }

      if (domain !== "general" && domain !== active.domain) {
        active = null;
        continue;
      }

      active = {
        domain: domain === "general" ? active.domain : domain,
        texts: [...active.texts, turn.content],
      };
    }

    return active;
  }

  private isContinuationEvidence(text: string): boolean {
    if (countWords(text) > this.config.detection.maxContinuationWords) {
      return false;
    }

    const hasContext = this.findPresentDimensions(text).length > 0;
    const configuredAnswer = this.matchesAny(
      text,
      this.config.detection.continuationAnswerPatterns,
    );
    const continuationCue = this.matchesAny(
      text,
      this.config.detection.continuationPatterns,
    );
    return hasContext || configuredAnswer || continuationCue;
  }

  private detectRequest(text: string): RequestDetection {
    const explicit = this.matchesAny(
      text,
      this.config.detection.explicitRequestPatterns,
    );
    const implicit = this.matchesAny(
      text,
      this.config.detection.implicitRequestPatterns,
    );

    return {
      explicit,
      implicit,
      confidence: explicit
        ? this.config.detection.confidence.explicit
        : implicit
          ? this.config.detection.confidence.implicit
          : 0,
    };
  }

  private classifyDomain(text: string): AdviceDomain {
    for (const domain of this.config.domains.precedence) {
      if (this.matchesAny(text, this.config.domains.patterns[domain])) {
        return domain;
      }
    }
    return "general";
  }

  private findPresentDimensions(text: string): AdviceContextDimension[] {
    return contextDimensions.filter((dimension) =>
      this.matchesAny(
        text,
        this.config.context.dimensionPatterns[dimension],
      ),
    );
  }

  private assessContext(texts: string[]): {
    score: number;
    dimensions: Record<AdviceContextDimension, AdviceContextEvidence>;
    present: AdviceContextDimension[];
  } {
    const currentIndex = texts.length - 1;
    const dimensions = Object.fromEntries(
      contextDimensions.map((dimension) => {
        const patterns = this.config.context.dimensionPatterns[dimension];
        const currentMatches = this.matchingPatterns(
          texts[currentIndex] ?? "",
          patterns,
        );
        const historyMatches = texts
          .slice(0, currentIndex)
          .flatMap((text) => this.matchingPatterns(text, patterns));
        const sources = [
          ...(currentMatches.length > 0
            ? (["current_turn"] as const)
            : []),
          ...(historyMatches.length > 0
            ? (["recent_user_history"] as const)
            : []),
        ];
        const evidence: AdviceContextEvidence = {
          present: sources.length > 0,
          sources,
          matchedPatterns: [
            ...new Set([...currentMatches, ...historyMatches]),
          ],
        };
        return [dimension, evidence] as const;
      }),
    ) as Record<AdviceContextDimension, AdviceContextEvidence>;
    const present = contextDimensions.filter(
      (dimension) => dimensions[dimension].present,
    );
    const totalWeight = contextDimensions.reduce(
      (total, dimension) =>
        total + this.config.context.weights[dimension],
      0,
    );
    const presentWeight = present.reduce(
      (total, dimension) =>
        total + this.config.context.weights[dimension],
      0,
    );

    return {
      score: roundScore(
        totalWeight > 0 ? presentWeight / totalWeight : 0,
      ),
      dimensions,
      present,
    };
  }

  private selectQuestionFocus(
    domain: AdviceDomain,
    missing: AdviceContextDimension[],
  ): AdviceContextDimension[] {
    const priority = this.config.context.clarificationPriorityByDomain[domain];
    const ordered = [
      ...priority.filter((dimension) => missing.includes(dimension)),
      ...missing.filter((dimension) => !priority.includes(dimension)),
    ];
    return ordered.slice(
      0,
      this.config.context.maxClarificationDimensions,
    );
  }

  private matchesAny(text: string, patterns: readonly string[]): boolean {
    return this.matchingPatterns(text, patterns).length > 0;
  }

  private matchingPatterns(
    text: string,
    patterns: readonly string[],
  ): string[] {
    const normalized = normalizeText(text);
    const padded = ` ${normalized} `;

    return patterns.filter((pattern) => {
      const normalizedPattern = normalizeText(pattern);
      if (!normalizedPattern) return false;
      return padded.includes(` ${normalizedPattern} `);
    });
  }
}
