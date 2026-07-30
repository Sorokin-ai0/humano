import { z } from "zod";
import { modelVariants } from "../domain/types";

const taskKinds = [
  "social",
  "acknowledgement",
  "simple_fact",
  "identity",
  "humor",
  "emotional_support",
  "personal_sharing",
  "definition",
  "explanation",
  "recommendation",
  "comparison",
  "procedure",
  "troubleshooting",
  "analysis",
  "clarification",
  "general",
] as const;

const coverageElements = [
  "natural_response",
  "direct_answer",
  "currency_check",
  "essential_context",
  "definition",
  "mechanism_or_reason",
  "concrete_example",
  "recommendation",
  "rationale",
  "first_action",
  "ordered_steps",
  "comparison_axes",
  "tradeoff",
  "likely_cause",
  "ordered_checks",
  "decision_branch",
  "important_caveat",
  "specific_acknowledgement",
] as const;

const adviceDomains = [
  "fitness",
  "nutrition",
  "career",
  "product_choice",
  "technical",
  "general",
] as const;

const adviceContextDimensions = [
  "goal",
  "current_state",
  "constraints",
  "preferences",
  "resources",
] as const;

const lengthPlanSchema = z
  .object({
    minimumUsefulWords: z.number().int().nonnegative(),
    targetWords: z.number().int().positive(),
    hardMaxWords: z.number().int().positive(),
    minimumUsefulSentences: z.number().int().nonnegative(),
    maxSentences: z.number().int().positive(),
    maxOutputTokens: z.number().int().positive(),
  })
  .refine(
    (plan) =>
      plan.minimumUsefulWords <= plan.targetWords &&
      plan.targetWords <= plan.hardMaxWords,
    { message: "Length budgets must satisfy minimum <= target <= hard max." },
  )
  .refine(
    (plan) => plan.minimumUsefulSentences <= plan.maxSentences,
    { message: "Minimum useful sentences cannot exceed the sentence cap." },
  );

const emotionLabels = [
  "frustration",
  "excitement",
  "confusion",
  "curiosity",
  "sadness",
  "urgency",
  "confidence",
  "uncertainty",
] as const;

const humanStateLabels = [
  "hunger",
  "fatigue",
  "physical_discomfort",
  "illness",
  "stress",
  "loneliness",
  "boredom",
  "relief",
  "thirst",
  "anxiety",
  "embarrassment",
  "grief",
  "anger",
  "disappointment",
  "indecision",
  "rejection",
  "homesickness",
  "pride",
  "anticipation",
  "relationship_conflict",
  "financial_pressure",
  "workload",
] as const;

const memoryKinds = [
  "long_term",
  "user_profile",
  "important_fact",
  "preference",
  "goal",
] as const;

const adviceConfigSchema = z.object({
  algorithmVersion: z.string().min(1),
  recentUserTurnLimit: z.number().int().positive(),
  detection: z.object({
    explicitRequestPatterns: z.array(z.string().min(1)),
    implicitRequestPatterns: z.array(z.string().min(1)),
    personalizationPatterns: z.array(z.string().min(1)),
    continuationPatterns: z.array(z.string().min(1)),
    continuationAnswerPatterns: z.array(z.string().min(1)),
    maxContinuationWords: z.number().int().positive(),
    minimumRequestConfidence: z.number().min(0).max(1),
    confidence: z.object({
      explicit: z.number().min(0).max(1),
      implicit: z.number().min(0).max(1),
      continued: z.number().min(0).max(1),
    }),
  }),
  urgency: z.object({
    emotionThreshold: z.number().min(0).max(1),
    patterns: z.array(z.string().min(1)),
  }),
  domains: z.object({
    precedence: z
      .array(z.enum(adviceDomains))
      .length(adviceDomains.length)
      .refine((domains) => new Set(domains).size === adviceDomains.length, {
        message: "Advice domain precedence must contain each domain once.",
      }),
    patterns: z.record(
      z.enum(adviceDomains),
      z.array(z.string().min(1)),
    ),
  }),
  context: z.object({
    dimensionPatterns: z.record(
      z.enum(adviceContextDimensions),
      z.array(z.string().min(1)),
    ),
    weights: z
      .record(
        z.enum(adviceContextDimensions),
        z.number().min(0).max(1),
      )
      .refine(
        (weights) =>
          Object.values(weights).reduce(
            (total, weight) => total + weight,
            0,
          ) > 0,
        { message: "At least one advice context weight must be positive." },
      ),
    readinessThresholdByDomain: z.record(
      z.enum(adviceDomains),
      z.number().min(0).max(1),
    ),
    minimumDimensionCountByDomain: z.record(
      z.enum(adviceDomains),
      z.number().int().min(0).max(adviceContextDimensions.length),
    ),
    clarificationPriorityByDomain: z.record(
      z.enum(adviceDomains),
      z.array(z.enum(adviceContextDimensions)),
    ),
    maxClarificationDimensions: z
      .number()
      .int()
      .min(1)
      .max(adviceContextDimensions.length),
  }),
  clarificationInstructions: z.record(
    z.enum(adviceContextDimensions),
    z.string().min(1),
  ),
  clarificationQuestionPatterns: z.record(
    z.enum(adviceContextDimensions),
    z.array(z.string().min(1)).min(1),
  ),
  clarificationFallbacks: z.record(
    z.enum(adviceDomains),
    z.string().min(1).refine(
      (fallback) => (fallback.match(/\?/gu)?.length ?? 0) === 1,
      {
        message:
          "Each advice clarification fallback must contain exactly one question mark.",
      },
    ),
  ),
});

const adviceStyleRuleSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/u),
    pattern: z.string().min(1),
    flags: z.string().regex(/^[dgimsuvy]*$/u),
    replacement: z.string().min(1),
    changeTag: z.string().regex(/^[a-z][a-z0-9_]*$/u),
  })
  .superRefine((rule, context) => {
    try {
      new RegExp(rule.pattern, rule.flags);
    } catch {
      context.addIssue({
        code: "custom",
        path: ["pattern"],
        message: `Advice style rule "${rule.id}" must contain a valid regular expression and flags.`,
      });
    }
  });

export const humanoConfigSchema = z.object({
  schemaVersion: z.literal("2.0"),
  behaviorVersion: z.string().min(1),
  promptTemplateVersion: z.string().min(1),
  provider: z.object({
    kind: z.literal("openrouter"),
    models: z.record(z.enum(modelVariants), z.string().min(1)),
    baseUrl: z.string().url(),
    appName: z.string().min(1),
    timeoutMs: z.number().int().positive(),
    maxRetries: z.number().int().min(0).max(3),
    retryBaseDelayMs: z.number().int().nonnegative(),
    retryMaxDelayMs: z.number().int().positive(),
    reasoningMode: z.literal("disabled"),
    sendPseudonymousUserId: z.boolean(),
    dataCollection: z.enum(["allow", "deny"]),
    sampling: z.object({
      temperature: z.number().min(0).max(2),
      topP: z.number().min(0).max(1),
      topK: z.number().int().positive(),
      frequencyPenalty: z.number().min(-2).max(2),
      presencePenalty: z.number().min(-2).max(2),
    }),
  }),
  generationProfiles: z.record(
    z.enum(modelVariants),
    z.object({
      label: z.string().min(1),
      description: z.string().min(1),
      outputTokenMultiplier: z.number().positive().max(1),
      allowRevision: z.boolean(),
    }),
  ),
  modes: z.object({
    debate: z.object({
      label: z.string().min(1),
      description: z.string().min(1),
      systemInstruction: z.string().min(1),
      choiceInstruction: z.string().min(1),
      challengeInstruction: z.string().min(1),
      allowRevision: z.boolean(),
      thesisPatterns: z.array(z.string().min(1)).min(1),
      softeningPatterns: z.array(z.string().min(1)).min(1),
      choiceEvasionPatterns: z.array(z.string().min(1)).min(1),
      unsupportedAttributionPatterns: z.array(z.string().min(1)).min(1),
      minimumFit: z.number().min(0).max(1),
    }),
  }),
  conversation: z.object({
    maxInputChars: z.number().int().positive(),
    maxHistoryTurns: z.number().int().positive(),
    contextWindowTokens: z.number().int().positive(),
    contextReserveTokens: z.number().int().positive(),
    estimatedCharsPerToken: z.number().positive(),
    sessionTtlDays: z.number().int().positive(),
  }),
  planner: z.object({
    short: lengthPlanSchema,
    social: lengthPlanSchema,
    minimal: lengthPlanSchema,
    opinion: lengthPlanSchema,
    debate: lengthPlanSchema,
    medium: lengthPlanSchema,
    long: lengthPlanSchema,
    explicitBrevityPatterns: z.array(z.string()),
    explicitDetailPatterns: z.array(z.string()),
    explicitLongPatterns: z.array(z.string()),
    clarificationPatterns: z.array(z.string()),
    challengePatterns: z.array(z.string()),
    acknowledgementPatterns: z.array(z.string()),
    identityPatterns: z.array(z.string()),
    memoryQuestionPatterns: z.array(z.string()),
    socialGreetingPatterns: z.array(z.string()),
    socialGreetingMaxEditDistance: z.number().int().min(0).max(2),
    humorRequestPatterns: z.array(z.string()),
    blockingAmbiguityWordThreshold: z.number().int().positive(),
    formatPatterns: z.object({
      bullets: z.array(z.string()),
      steps: z.array(z.string()),
      code: z.array(z.string()),
    }),
    empathyThreshold: z.number().min(0).max(1),
    urgencyThreshold: z.number().min(0).max(1),
    excitementThreshold: z.number().min(0).max(1),
    memoryReferenceThreshold: z.number().min(0).max(1),
    memorySelectionLimit: z.number().int().positive(),
    maxQuestions: z.number().int().min(0).max(2),
    opinionRequestPatterns: z.array(z.string().min(1)).min(1),
    choiceRequestPatterns: z.array(z.string().min(1)).min(1),
    opinionResponsePatterns: z.array(z.string().min(1)).min(1),
    opinionEvasionPatterns: z.array(z.string().min(1)).min(1),
    formalOpinionPatterns: z.array(z.string().min(1)).min(1),
    opinionRantTargetMultiplier: z.number().min(1).max(3),
    shortChoiceOpinionMaxWords: z.number().int().positive(),
    humanState: z.object({
      algorithmVersion: z.string().min(1),
      priority: z
        .array(z.enum(humanStateLabels))
        .length(humanStateLabels.length)
        .refine((labels) => new Set(labels).size === humanStateLabels.length, {
          message: "Human-state priority must contain each state exactly once.",
        }),
      states: z.record(
        z.enum(humanStateLabels),
        z.object({
          valence: z.enum(["need", "discomfort", "support", "pleasant"]),
          patterns: z.array(z.string().min(1)).min(1),
          responseInstruction: z.string().min(1),
          allowFollowUp: z.boolean(),
          recoveryResponses: z.array(z.string().min(1)).min(1),
        }),
      ),
      incongruentPositiveResponsePatterns: z.array(z.string().min(1)).min(1),
      prematureDirectivePatterns: z.array(z.string().min(1)).min(1),
    }),
    depth: z.object({
      algorithmVersion: z.string().min(1),
      thresholds: z
        .object({
          explained: z.number().min(0).max(1),
          deep: z.number().min(0).max(1),
        })
        .refine((value) => value.explained < value.deep, {
          message: "The explained threshold must be below the deep threshold.",
        }),
      taskBaseScores: z.record(
        z.enum(taskKinds),
        z.number().min(0).max(1),
      ),
      taskPrecedence: z.array(z.enum(taskKinds)).min(1),
      minimalTaskKinds: z.array(z.enum(taskKinds)),
      taskPatterns: z.record(z.enum(taskKinds), z.array(z.string())),
      coverageByTask: z.record(
        z.enum(taskKinds),
        z.array(z.enum(coverageElements)),
      ),
      coverageInstructions: z.record(
        z.enum(coverageElements),
        z.string().min(1),
      ),
      deepAdditionalCoverage: z.array(z.enum(coverageElements)),
      adjustments: z.object({
        multiPart: z.number().min(0).max(1),
        confusion: z.number().min(0).max(1),
        substantialContext: z.number().min(0).max(1),
        contextualFollowUp: z.number().min(-1).max(0),
        exampleRequested: z.number().min(0).max(1),
        explicitDetailFloor: z.number().min(0).max(1),
        explicitBrevityCeiling: z.number().min(0).max(1),
      }),
      confusionThreshold: z.number().min(0).max(1),
      substantialContextWordThreshold: z.number().int().positive(),
      contextualFollowUpMaxWords: z.number().int().positive(),
      contextualFollowUpPatterns: z.array(z.string()),
      multiPartPatterns: z.array(z.string()),
      exampleRequestPatterns: z.array(z.string()),
    }),
    advice: adviceConfigSchema,
  }),
  emotion: z.object({
    baselines: z.record(z.enum(emotionLabels), z.number().min(0).max(1)),
    lexicalEvidenceWeight: z.number().min(0).max(1),
    explicitEvidenceWeight: z.number().min(0).max(1),
    punctuationEvidenceCap: z.number().min(0).max(1),
    surfaceSignalProbabilityCap: z.number().min(0).max(1),
    priorTurnBlend: z.number().min(0).max(1),
    dominantThreshold: z.number().min(0).max(1),
    maxProbability: z.number().min(0).max(1),
    minProbability: z.number().min(0).max(1),
    lexicons: z.record(z.enum(emotionLabels), z.array(z.string())),
    negationPrefixes: z.array(z.string()),
  }),
  memory: z.object({
    retrievalCandidateLimit: z.number().int().positive(),
    retrievalLimit: z.number().int().positive(),
    plannerSelectionLimit: z.number().int().positive(),
    minRetrievalScore: z.number().min(0).max(1),
    maxItemsPerSubject: z.number().int().positive(),
    dedupeSimilarity: z.number().min(0).max(1),
    sensitivePatterns: z.array(z.string()),
    weights: z.object({
      lexicalOverlap: z.number().min(0).max(1),
      recency: z.number().min(0).max(1),
      importance: z.number().min(0).max(1),
      typeFit: z.number().min(0).max(1),
      continuity: z.number().min(0).max(1),
    }),
    kindWeights: z.record(z.enum(memoryKinds), z.number().min(0).max(1)),
    halfLifeDays: z.record(z.enum(memoryKinds), z.number().positive()),
    extractionPatterns: z.record(z.enum(memoryKinds), z.array(z.string())),
  }),
  personality: z.object({
    name: z.string().min(1),
    traits: z.object({
      calm: z.number().min(0).max(1),
      curious: z.number().min(0).max(1),
      confident: z.number().min(0).max(1),
      honest: z.number().min(0).max(1),
      humorous: z.number().min(0).max(1),
    }),
    description: z.string().min(1),
    forbiddenBehaviors: z.array(z.string()),
  }),
  naturalness: z.object({
    hardPhrases: z.array(z.string()),
    softPhrases: z.array(z.string()),
    replaceableOpeners: z.array(z.string()),
    registerReplacements: z.array(
      z.object({
        pattern: z.string().min(1),
        replacement: z.string().min(1),
      }),
    ),
    trailingOfferPatterns: z.array(z.string()),
    serviceOfferPatterns: z.array(z.string()),
    stripReasoningTags: z.boolean(),
    maxRepeatedPunctuation: z.number().int().min(1),
    paragraphBreakAfterSentences: z.number().int().positive(),
    fallbackResponse: z.string().min(1),
    identityFallbackResponse: z.string().min(1),
    socialRecoveryResponses: z.array(z.string().min(1)).min(1),
  }),
  adviceStyle: z.object({
    algorithmVersion: z.string().min(1),
    enabled: z.boolean(),
    recommendation: z.object({
      enabled: z.boolean(),
      maxSentences: z.number().int().min(1),
      changeTag: z.string().regex(/^[a-z][a-z0-9_]*$/u),
    }),
    rules: z.array(adviceStyleRuleSchema).min(1),
  }),
  validator: z.object({
    acceptThreshold: z.number().min(0).max(1),
    reviseThreshold: z.number().min(0).max(1),
    maxCandidates: z.number().int().min(1).max(2),
    revisionScoreTolerance: z.number().min(0).max(0.25),
    sufficiencyImprovementThreshold: z.number().min(0).max(1),
    adviceImprovementThreshold: z.number().min(0).max(1),
    hardLengthMultiplier: z.number().positive(),
    weights: z
      .object({
        naturalness: z.number().min(0).max(1),
        lengthFit: z.number().min(0).max(1),
        answerSufficiency: z.number().min(0).max(1),
        adviceReadinessFit: z.number().min(0).max(1),
        consideredOpinionFit: z.number().min(0).max(1),
        emotionFit: z.number().min(0).max(1),
        roboticWording: z.number().min(0).max(1),
        agreementBias: z.number().min(0).max(1),
        memoryUse: z.number().min(0).max(1),
        questionQuality: z.number().min(0).max(1),
        repetition: z.number().min(0).max(1),
        confidenceCalibration: z.number().min(0).max(1),
        transparency: z.number().min(0).max(1),
        conversationalRegisterFit: z.number().min(0).max(1),
      })
      .refine(
        (weights) =>
          Math.abs(
            Object.values(weights).reduce(
              (total, weight) => total + weight,
              0,
            ) - 1,
          ) < 0.0001,
        { message: "Validator weights must sum to 1." },
      ),
    humanClaimPatterns: z.array(z.string()),
    blindAgreementPatterns: z.array(z.string()),
    absoluteConfidencePatterns: z.array(z.string()),
    internalLeakPatterns: z.array(z.string()),
    unsolicitedDisclaimerPatterns: z.array(z.string()),
    questionContentPatterns: z.array(z.string()),
    followUpQuestionPatterns: z.array(z.string()),
    empathyMarkers: z.array(z.string()),
    adviceOpinionPatterns: z.array(z.string()),
    adviceRationalePatterns: z.array(z.string()),
    prescriptiveAdvicePatterns: z.array(z.string()),
    prematureAdvicePatterns: z.array(z.string()),
    minimumAdviceReadinessFit: z.number().min(0).max(1),
    minimumConsideredOpinionFit: z.number().min(0).max(1),
    minimumConversationalRegisterFit: z.number().min(0).max(1),
    multipleClarificationQuestionCredit: z.number().min(0).max(1),
    adviceReadinessWeights: z
      .object({
        questionCompliance: z.number().min(0).max(1),
        noPrematureAdvice: z.number().min(0).max(1),
        focusCoverage: z.number().min(0).max(1),
      })
      .refine(
        (weights) =>
          Math.abs(
            weights.questionCompliance +
              weights.noPrematureAdvice +
              weights.focusCoverage -
              1,
          ) < 0.0001,
        { message: "Advice readiness weights must sum to 1." },
      ),
    consideredOpinionWeights: z
      .object({
        calibratedOpinion: z.number().min(0).max(1),
        rationale: z.number().min(0).max(1),
        nonPrescriptive: z.number().min(0).max(1),
      })
      .refine(
        (weights) =>
          Math.abs(
            weights.calibratedOpinion +
              weights.rationale +
              weights.nonPrescriptive -
              1,
          ) < 0.0001,
        { message: "Considered opinion weights must sum to 1." },
      ),
    minimumSufficiencyScore: z.number().min(0).max(1),
    sufficiencyWeights: z
      .object({
        words: z.number().min(0).max(1),
        sentences: z.number().min(0).max(1),
        coverageCapacity: z.number().min(0).max(1),
      })
      .refine(
        (weights) =>
          Math.abs(
            weights.words +
              weights.sentences +
              weights.coverageCapacity -
              1,
          ) < 0.0001,
        { message: "Answer sufficiency weights must sum to 1." },
      ),
    wordsPerContentUnit: z.number().positive(),
  }),
  security: z.object({
    requestsPerWindow: z.number().int().positive(),
    rateLimitWindowMs: z.number().int().positive(),
    allowedOrigins: z.array(z.string()),
  }),
  observability: z.object({
    enabled: z.boolean(),
    logContent: z.boolean(),
    logLevel: z.enum(["debug", "info", "warn", "error"]),
  }),
  training: z.object({
    enabled: z.boolean(),
    storeRawContent: z.boolean(),
    redactionMarker: z.string(),
    eventSchemaVersion: z.literal("2.0"),
  }),
});

export type HumanoConfig = z.infer<typeof humanoConfigSchema>;
