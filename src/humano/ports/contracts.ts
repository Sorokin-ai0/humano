import type {
  AdviceReadinessAssessment,
  ConversationPlan,
  ConversationMode,
  ConversationTaskKind,
  ConversationTurn,
  DepthAssessment,
  EmotionAssessment,
  FeedbackRecord,
  HumanStateAssessment,
  FilterResult,
  GenerationRequest,
  GenerationResult,
  MemoryId,
  ModelVariant,
  PersonalitySnapshot,
  PromptEnvelope,
  ResponseEvaluation,
  RetrievedMemory,
  SessionId,
  StoredMemory,
  SubjectId,
  TrainingEventV2,
  TurnId,
} from "../domain/types";

export interface ConversationRepository {
  ensureSession(
    sessionId: SessionId,
    subjectId: SubjectId,
    now: string,
  ): Promise<void>;
  listTurns(
    sessionId: SessionId,
    limit: number,
  ): Promise<ConversationTurn[]>;
  appendTurn(turn: Omit<ConversationTurn, "ordinal">): Promise<ConversationTurn>;
  deleteSession(sessionId: SessionId, subjectId: SubjectId): Promise<void>;
}

/** Erases every conversation-derived record belonging to one anonymous user. */
export interface SubjectDataRepository {
  deleteAllForSubject(subjectId: SubjectId): Promise<void>;
}

export interface MemoryRepository {
  listForSubject(subjectId: SubjectId, limit: number): Promise<StoredMemory[]>;
  upsert(memory: StoredMemory): Promise<void>;
  touch(ids: MemoryId[], now: string): Promise<void>;
  deleteForSubject(subjectId: SubjectId): Promise<void>;
}

export interface TrainingEventRepository {
  append(event: TrainingEventV2): Promise<void>;
  addFeedback(feedback: FeedbackRecord): Promise<void>;
}

export interface LanguageModelProvider {
  readonly name: string;
  readonly model: string;
  generate(
    request: GenerationRequest,
    signal?: AbortSignal,
  ): Promise<GenerationResult>;
}

export interface EmotionEngine {
  analyze(
    text: string,
    prior?: EmotionAssessment,
  ): Promise<EmotionAssessment>;
}

export interface HumanStateEngine {
  assess(input: { text: string }): Promise<HumanStateAssessment>;
}

export interface MemoryEngine {
  retrieve(subjectId: SubjectId, query: string): Promise<RetrievedMemory[]>;
  observe(
    subjectId: SubjectId,
    turnId: TurnId,
    text: string,
    now: string,
  ): Promise<StoredMemory[]>;
}

export interface ConversationalDepthEngine {
  assess(input: {
    text: string;
    emotions: EmotionAssessment;
    history: ConversationTurn[];
    context: {
      socialExchange: boolean;
      acknowledgement: boolean;
      identityQuestion: boolean;
      humorRequest: boolean;
      materialAmbiguity: boolean;
      emotionalDisclosure: boolean;
      celebratoryDisclosure: boolean;
      directQuestion: boolean;
      requestedBrief: boolean;
      requestedDetail: boolean;
      requestedLong: boolean;
    };
    inheritedTaskKind?: ConversationTaskKind;
  }): Promise<DepthAssessment>;
}

export interface AdviceReadinessEngine {
  assess(input: {
    text: string;
    history: ConversationTurn[];
    urgency: number;
  }): Promise<AdviceReadinessAssessment>;
}

export interface ConversationPlanner {
  plan(input: {
    text: string;
    mode?: ConversationMode;
    emotions: EmotionAssessment;
    memories: RetrievedMemory[];
    history: ConversationTurn[];
  }): Promise<ConversationPlan>;
}

export interface PersonalityEngine {
  snapshot(): PersonalitySnapshot;
}

export interface PromptComposer {
  compose(input: {
    userText: string;
    modelVariant: ModelVariant;
    plan: ConversationPlan;
    emotions: EmotionAssessment;
    memories: RetrievedMemory[];
    history: ConversationTurn[];
    personality: PersonalitySnapshot;
  }): PromptEnvelope;
  composeRevision(
    original: PromptEnvelope,
    candidate: string,
    evaluation: ResponseEvaluation,
    modelVariant?: ModelVariant,
  ): PromptEnvelope;
}

export interface NaturalnessFilter {
  process(
    content: string,
    plan: ConversationPlan,
    modelVariant?: ModelVariant,
  ): Promise<FilterResult>;
}

export interface AdviceStyleFilter {
  process(content: string, plan: ConversationPlan): Promise<FilterResult>;
}

export interface ResponseValidator {
  evaluate(input: {
    response: string;
    userText: string;
    plan: ConversationPlan;
    emotions: EmotionAssessment;
    memories: RetrievedMemory[];
    history: ConversationTurn[];
    modelVariant?: ModelVariant;
  }): Promise<ResponseEvaluation>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  create(): string;
}

export interface TokenEstimator {
  estimate(text: string): number;
}

export interface ObservabilitySink {
  emit(
    event: string,
    attributes: Record<string, string | number | boolean | null>,
  ): void;
}
