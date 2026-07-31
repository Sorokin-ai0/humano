export type Brand<T, Name extends string> = T & {
  readonly __brand: Name;
};

export type SessionId = Brand<string, "SessionId">;
export type SubjectId = Brand<string, "SubjectId">;
export type TurnId = Brand<string, "TurnId">;
export type MemoryId = Brand<string, "MemoryId">;
export type TraceId = Brand<string, "TraceId">;

export type ConversationRole = "user" | "assistant";
export type ModelRole = "system" | ConversationRole;
export const conversationModes = ["standard", "debate"] as const;
export type ConversationMode = (typeof conversationModes)[number];
export const modelVariants = ["humano-1", "h1"] as const;
export type ModelVariant = (typeof modelVariants)[number];
export type ResponseLength = "short" | "medium" | "long";
export type ResponseFormat = "plain_prose" | "bullets" | "steps" | "code";
export type ConversationalDepth = "social" | "concise" | "explained" | "deep";
export type ConversationTaskKind =
  | "social"
  | "acknowledgement"
  | "simple_fact"
  | "identity"
  | "humor"
  | "emotional_support"
  | "personal_sharing"
  | "definition"
  | "explanation"
  | "recommendation"
  | "comparison"
  | "procedure"
  | "troubleshooting"
  | "analysis"
  | "clarification"
  | "general";
export type DepthSignal =
  | "social_turn"
  | "acknowledgement"
  | "simple_fact"
  | "identity_question"
  | "humor_request"
  | "emotional_turn"
  | "personal_sharing"
  | "definition_request"
  | "explanation_request"
  | "recommendation_request"
  | "comparison_request"
  | "procedure_request"
  | "troubleshooting_request"
  | "analysis_request"
  | "clarification_required"
  | "fallback_general"
  | "explicit_brevity"
  | "explicit_detail"
  | "explicit_long"
  | "multi_part"
  | "user_confusion"
  | "substantial_context"
  | "contextual_follow_up"
  | "example_requested";
export type CoverageElement =
  | "natural_response"
  | "direct_answer"
  | "currency_check"
  | "essential_context"
  | "definition"
  | "mechanism_or_reason"
  | "concrete_example"
  | "recommendation"
  | "rationale"
  | "first_action"
  | "ordered_steps"
  | "comparison_axes"
  | "tradeoff"
  | "likely_cause"
  | "ordered_checks"
  | "decision_branch"
  | "important_caveat"
  | "specific_acknowledgement";
export type AdviceDomain =
  | "fitness"
  | "nutrition"
  | "career"
  | "product_choice"
  | "technical"
  | "general";
export type AdviceContextDimension =
  | "goal"
  | "current_state"
  | "constraints"
  | "preferences"
  | "resources";
export type AdviceContextSource = "current_turn" | "recent_user_history";
export type AdviceReadinessMode =
  | "not_advice"
  | "clarify_first"
  | "considered_opinion"
  | "direct_guidance";
export type AdviceReadinessSignal =
  | "explicit_advice_request"
  | "implicit_advice_request"
  | "continued_advice_turn"
  | "personalized_request"
  | "domain_match"
  | "urgent_request"
  | "sufficient_context"
  | "insufficient_context";
export type MemoryKind =
  | "long_term"
  | "user_profile"
  | "important_fact"
  | "preference"
  | "goal";
export type EmotionLabel =
  | "frustration"
  | "excitement"
  | "confusion"
  | "curiosity"
  | "sadness"
  | "urgency"
  | "confidence"
  | "uncertainty";

export type HumanStateLabel =
  | "hunger"
  | "fatigue"
  | "physical_discomfort"
  | "illness"
  | "stress"
  | "loneliness"
  | "boredom"
  | "relief"
  | "thirst"
  | "anxiety"
  | "embarrassment"
  | "grief"
  | "anger"
  | "disappointment"
  | "indecision"
  | "rejection"
  | "homesickness"
  | "pride"
  | "anticipation"
  | "relationship_conflict"
  | "financial_pressure"
  | "workload";

export type HumanStateValence = "need" | "discomfort" | "support" | "pleasant";

export interface ConversationTurn {
  id: TurnId;
  sessionId: SessionId;
  ordinal: number;
  role: ConversationRole;
  content: string;
  createdAt: string;
  estimatedTokens: number;
}

export interface StoredMemory {
  id: MemoryId;
  subjectId: SubjectId;
  kind: MemoryKind;
  content: string;
  normalizedKey: string;
  salience: number;
  confidence: number;
  sourceTurnId: TurnId;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string | null;
  accessCount: number;
}

export interface RetrievedMemory {
  memory: StoredMemory;
  score: number;
  signals: string[];
}

export interface EmotionAssessment {
  schemaVersion: "1.0";
  probabilities: Record<EmotionLabel, number>;
  dominant: EmotionLabel | null;
  detectorConfidence: number;
  signals: string[];
}

/** Non-emotional personal states that need context-sensitive conversation. */
export interface HumanStateAssessment {
  schemaVersion: "1.0";
  algorithmVersion: string;
  primary: {
    label: HumanStateLabel;
    valence: HumanStateValence;
    responseInstruction: string;
    allowFollowUp: boolean;
    recoveryResponses: string[];
  } | null;
  matchedLabels: HumanStateLabel[];
  signals: string[];
}

export interface DepthAssessment {
  schemaVersion: "1.0";
  algorithmVersion: string;
  taskKind: ConversationTaskKind;
  level: ConversationalDepth;
  score: number;
  confidence: number;
  signals: DepthSignal[];
  coverage: CoverageElement[];
  minimumContentUnits: number;
}

export interface AdviceContextEvidence {
  present: boolean;
  sources: AdviceContextSource[];
  matchedPatterns: string[];
}

export interface AdviceReadinessAssessment {
  schemaVersion: "1.0";
  algorithmVersion: string;
  detected: boolean;
  domain: AdviceDomain;
  mode: AdviceReadinessMode;
  confidence: number;
  continuedAdviceTurn: boolean;
  urgent: boolean;
  missingContext: AdviceContextDimension[];
  questionFocus: AdviceContextDimension[] | null;
  context: {
    score: number;
    dimensions: Record<AdviceContextDimension, AdviceContextEvidence>;
    present: AdviceContextDimension[];
  };
  signals: AdviceReadinessSignal[];
}

export type DecisionTag =
  | "DIRECT_QUESTION"
  | "USER_REQUESTED_DETAIL"
  | "USER_REQUESTED_BREVITY"
  | "MATERIAL_AMBIGUITY"
  | "EMOTIONAL_ACKNOWLEDGEMENT"
  | "FACTUAL_CORRECTION"
  | "LOW_CONFIDENCE"
  | "RELEVANT_MEMORY"
  | "NO_QUESTION_NEEDED"
  | "URGENT"
  | "IDENTITY_TRANSPARENCY"
  | "CAPABILITY_LIMIT"
  | "SOCIAL_EXCHANGE"
  | "HUMOR_REQUEST"
  | "POSITIVE_EVENT"
  | "ADVICE_CONTEXT_REQUIRED"
  | "CONSIDERED_ADVICE"
  | "DIRECT_ADVICE"
  | "HUMAN_STATE_DISCLOSURE"
  | "USER_REQUESTED_OPINION"
  | "CHOICE_REQUEST"
  | "DEBATE_MODE";

export interface ConversationPlan {
  schemaVersion: "2.0";
  mode: ConversationMode;
  intent:
    | "answer"
    | "acknowledge"
    | "clarify"
    | "support"
    | "explore"
    | "refuse";
  answerFirst: boolean;
  length: {
    class: ResponseLength;
    minimumUsefulWords: number;
    targetWords: number;
    hardMaxWords: number;
    minimumUsefulSentences: number;
    maxSentences: number;
    maxOutputTokens: number;
  };
  depth: DepthAssessment;
  advice: AdviceReadinessAssessment;
  humanState: HumanStateAssessment;
  tone: {
    warmth: number;
    directness: number;
    energy: number;
    humor: "none" | "light";
  };
  question: {
    mode: "none" | "required_clarification" | "useful_follow_up";
    purpose: string | null;
  };
  stance: {
    mode:
      | "agree"
      | "neutral"
      | "soft_disagree"
      | "correct"
      | "considered_opinion"
      | "advocacy_debate"
      | "adversarial_debate";
    confidence: number;
  };
  empathy: "none" | "implicit" | "explicit";
  memory: {
    mode: "none" | "weave_implicitly" | "answer_memory_question";
    ids: MemoryId[];
  };
  uncertainty: "none" | "light" | "explicit";
  format: ResponseFormat;
  decisionTags: DecisionTag[];
}

export interface PersonalitySnapshot {
  name: string;
  description: string;
  traits: {
    calm: number;
    curious: number;
    confident: number;
    honest: number;
    humorous: number;
  };
  forbiddenBehaviors: string[];
}

export interface PromptEnvelope {
  messages: ModelMessage[];
  estimatedInputTokens: number;
  includedTurnIds: TurnId[];
  selectedMemoryIds: MemoryId[];
}

export interface ModelMessage {
  role: ModelRole;
  content: string;
}

export interface GenerationRequest {
  messages: ModelMessage[];
  modelVariant: ModelVariant;
  maxOutputTokens: number;
  temperature: number;
  topP: number;
  topK: number;
  frequencyPenalty: number;
  presencePenalty: number;
  traceId: TraceId;
  pseudonymousUserId?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
}

export interface GenerationResult {
  content: string;
  provider: string;
  model: string;
  finishReason: string | null;
  usage: TokenUsage;
  latencyMs: number;
  generationId?: string;
}

export interface FilterResult {
  content: string;
  changes: string[];
}

export interface ResponseEvaluation {
  schemaVersion: "2.0";
  scores: {
    naturalness: number;
    roboticWordingRisk: number;
    lengthFit: number;
    answerSufficiency: number;
    adviceReadinessFit: number;
    consideredOpinionFit: number;
    emotionFit: number;
    agreementBiasRisk: number;
    memoryUseFit: number;
    questionQuality: number;
    repetitionRisk: number;
    confidenceCalibration: number;
    transparency: number;
    conversationalRegisterFit: number;
    debateFit: number;
  };
  hardViolations: string[];
  revisionTags: string[];
  overall: number;
  action: "accept" | "revise" | "regenerate";
}

export interface PlannerTrace {
  traceId: TraceId;
  plan: ConversationPlan;
  emotions: EmotionAssessment;
  memoryCount: number;
  validator: ResponseEvaluation;
  filterChanges: string[];
  latencyMs: number;
  provider: string;
  model: string;
  modelVariant: ModelVariant;
  tokenUsage: TokenUsage;
}

export interface TurnResponse {
  sessionId: SessionId;
  turnId: TurnId;
  response: string;
  trace: PlannerTrace;
}

export interface TrainingEventV2 {
  eventId: string;
  eventType: "turn_completed";
  schemaVersion: "2.0";
  occurredAt: string;
  sessionId: SessionId;
  subjectId: SubjectId;
  userTurnId: TurnId;
  assistantTurnId: TurnId;
  traceId: TraceId;
  configSchemaVersion: string;
  behaviorVersion: string;
  promptTemplateVersion: string;
  depthAlgorithmVersion: string;
  adviceAlgorithmVersion: string;
  adviceStyleAlgorithmVersion: string;
  plan: ConversationPlan;
  emotion: EmotionAssessment;
  memoryCandidates: Array<{
    id: MemoryId;
    kind: MemoryKind;
    score: number;
    selected: boolean;
  }>;
  generation: {
    provider: string;
    model: string;
    modelVariant: ModelVariant;
    finishReason: string | null;
    latencyMs: number;
    usage: TokenUsage;
  };
  candidate: string | null;
  finalResponse: string | null;
  filterChanges: string[];
  initialValidation: ResponseEvaluation;
  validation: ResponseEvaluation;
  selection: {
    source:
      | "first_candidate"
      | "revision_candidate"
      | "advice_clarification_recovery"
      | "advice_style_recovery"
      | "human_state_recovery"
      | "social_recovery"
      | "safe_fallback";
    revised: boolean;
  };
  privacy: {
    rawContentStored: boolean;
    hiddenReasoningStored: false;
    redactionPolicy: "secrets-and-identifiers";
  };
}

export interface FeedbackRecord {
  id: string;
  sessionId: SessionId;
  turnId: TurnId;
  rating: "positive" | "negative";
  note: string | null;
  createdAt: string;
}
