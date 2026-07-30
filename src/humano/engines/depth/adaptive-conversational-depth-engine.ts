import type { HumanoConfig } from "../../config/schema";
import type {
  ConversationTaskKind,
  ConversationalDepth,
  CoverageElement,
  DepthAssessment,
  DepthSignal,
} from "../../domain/types";
import type { ConversationalDepthEngine } from "../../ports/contracts";
import {
  clamp,
  countWords,
  includesAny,
  normalizeText,
  roundScore,
} from "../../core/text";

const taskSignals: Record<ConversationTaskKind, DepthSignal> = {
  social: "social_turn",
  acknowledgement: "acknowledgement",
  simple_fact: "simple_fact",
  identity: "identity_question",
  humor: "humor_request",
  emotional_support: "emotional_turn",
  personal_sharing: "personal_sharing",
  definition: "definition_request",
  explanation: "explanation_request",
  recommendation: "recommendation_request",
  comparison: "comparison_request",
  procedure: "procedure_request",
  troubleshooting: "troubleshooting_request",
  analysis: "analysis_request",
  clarification: "clarification_required",
  general: "fallback_general",
};

const contextBoundKinds = new Set<ConversationTaskKind>([
  "definition",
  "explanation",
  "recommendation",
  "comparison",
  "procedure",
  "troubleshooting",
  "analysis",
]);

/**
 * Estimates how much explanation the next turn owes the user. The result is
 * provider-neutral and becomes an explicit, trainable planning target.
 */
export class AdaptiveConversationalDepthEngine
  implements ConversationalDepthEngine
{
  constructor(private readonly config: HumanoConfig["planner"]["depth"]) {}

  async assess(
    input: Parameters<ConversationalDepthEngine["assess"]>[0],
  ): Promise<DepthAssessment> {
    const normalized = normalizeText(input.text);
    const wordCount = countWords(input.text);
    const contextualFollowUp = this.isContextualFollowUp(
      normalized,
      wordCount,
    );
    const classified = this.classifyTask(
      normalized,
      input.context,
      contextualFollowUp ? input.history : [],
    );
    const taskKind = input.inheritedTaskKind ?? classified.taskKind;
    const signals: DepthSignal[] = [taskSignals[taskKind]];
    let score = this.config.taskBaseScores[taskKind];
    let confidence = classified.matchedPattern ? 0.78 : 0.6;

    if (contextualFollowUp) {
      score += this.config.adjustments.contextualFollowUp;
      signals.push("contextual_follow_up");
      confidence += 0.05;
    }
    const multiPart =
      (input.text.match(/\?/gu)?.length ?? 0) > 1 ||
      includesAny(input.text, this.config.multiPartPatterns);
    if (multiPart) {
      score += this.config.adjustments.multiPart;
      signals.push("multi_part");
    }
    if (
      input.emotions.probabilities.confusion >=
      this.config.confusionThreshold
    ) {
      score += this.config.adjustments.confusion;
      signals.push("user_confusion");
    }
    if (wordCount >= this.config.substantialContextWordThreshold) {
      score += this.config.adjustments.substantialContext;
      signals.push("substantial_context");
    }
    const exampleRequested = includesAny(
      input.text,
      this.config.exampleRequestPatterns,
    );
    if (exampleRequested) {
      score += this.config.adjustments.exampleRequested;
      signals.push("example_requested");
    }
    if (input.context.requestedBrief) {
      score = Math.min(
        score,
        this.config.adjustments.explicitBrevityCeiling,
      );
      signals.push("explicit_brevity");
      confidence += 0.12;
    }
    if (input.context.requestedDetail) {
      score = Math.max(score, this.config.adjustments.explicitDetailFloor);
      signals.push("explicit_detail");
      confidence += 0.12;
    }
    if (input.context.requestedLong) {
      score = 1;
      signals.push("explicit_long");
      confidence += 0.15;
    }

    score = clamp(score);
    const level = this.chooseLevel(taskKind, score);
    const coverage = this.chooseCoverage(
      taskKind,
      level,
      exampleRequested,
    );

    return {
      schemaVersion: "1.0",
      algorithmVersion: this.config.algorithmVersion,
      taskKind,
      level,
      score: roundScore(score),
      confidence: roundScore(clamp(confidence)),
      signals: [...new Set(signals)],
      coverage,
      minimumContentUnits: coverage.length,
    };
  }

  private classifyTask(
    normalized: string,
    context: Parameters<ConversationalDepthEngine["assess"]>[0]["context"],
    history: Parameters<ConversationalDepthEngine["assess"]>[0]["history"],
  ): { taskKind: ConversationTaskKind; matchedPattern: boolean } {
    if (context.socialExchange) {
      return { taskKind: "social", matchedPattern: true };
    }
    if (context.materialAmbiguity) {
      return { taskKind: "clarification", matchedPattern: true };
    }
    if (context.acknowledgement || context.celebratoryDisclosure) {
      return { taskKind: "acknowledgement", matchedPattern: true };
    }
    if (context.identityQuestion) {
      return { taskKind: "identity", matchedPattern: true };
    }
    if (context.humorRequest) {
      return { taskKind: "humor", matchedPattern: true };
    }
    if (context.emotionalDisclosure) {
      return { taskKind: "emotional_support", matchedPattern: true };
    }

    if (history.length > 0) {
      const priorUserText = [...history]
        .reverse()
        .find((turn) => turn.role === "user")?.content;
      if (priorUserText) {
        const inherited = this.classifyByPatterns(normalizeText(priorUserText));
        if (contextBoundKinds.has(inherited.taskKind)) {
          return { taskKind: inherited.taskKind, matchedPattern: true };
        }
      }
    }

    return this.classifyByPatterns(normalized);
  }

  private classifyByPatterns(normalized: string): {
    taskKind: ConversationTaskKind;
    matchedPattern: boolean;
  } {
    for (const taskKind of this.config.taskPrecedence) {
      const patterns = this.config.taskPatterns[taskKind];
      if (patterns.length > 0 && includesAny(normalized, patterns)) {
        return { taskKind, matchedPattern: true };
      }
    }
    return { taskKind: "general", matchedPattern: false };
  }

  private isContextualFollowUp(
    normalized: string,
    wordCount: number,
  ): boolean {
    if (wordCount > this.config.contextualFollowUpMaxWords) return false;
    return this.config.contextualFollowUpPatterns.some((pattern) => {
      const normalizedPattern = normalizeText(pattern);
      return (
        normalized === normalizedPattern ||
        normalized.startsWith(`${normalizedPattern} `)
      );
    });
  }

  private chooseLevel(
    taskKind: ConversationTaskKind,
    score: number,
  ): ConversationalDepth {
    if (
      taskKind === "social" ||
      taskKind === "acknowledgement" ||
      taskKind === "clarification"
    ) {
      return "social";
    }
    if (score >= this.config.thresholds.deep) return "deep";
    if (score >= this.config.thresholds.explained) return "explained";
    return "concise";
  }

  private chooseCoverage(
    taskKind: ConversationTaskKind,
    level: ConversationalDepth,
    exampleRequested: boolean,
  ): CoverageElement[] {
    const coverage = [...this.config.coverageByTask[taskKind]];
    if (exampleRequested) coverage.push("concrete_example");
    if (level === "deep") {
      coverage.push(...this.config.deepAdditionalCoverage);
    }
    return [...new Set(coverage)];
  }
}
