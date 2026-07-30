import type { HumanoConfig } from "../config/schema";
import type {
  EmotionAssessment,
  FeedbackRecord,
  GenerationResult,
  MemoryId,
  ConversationPlan,
  ConversationMode,
  ModelVariant,
  PromptEnvelope,
  ResponseEvaluation,
  RetrievedMemory,
  SessionId,
  SubjectId,
  TrainingEventV2,
  TraceId,
  TurnId,
  TurnResponse,
} from "../domain/types";
import type {
  AdviceStyleFilter,
  Clock,
  ConversationPlanner,
  ConversationRepository,
  EmotionEngine,
  IdGenerator,
  LanguageModelProvider,
  MemoryEngine,
  MemoryRepository,
  NaturalnessFilter,
  ObservabilitySink,
  PersonalityEngine,
  PromptComposer,
  ResponseValidator,
  SubjectDataRepository,
  TokenEstimator,
  TrainingEventRepository,
} from "../ports/contracts";
import { countWords, redactSecrets, stableHash } from "../core/text";

export interface HumanoConversationEngineDependencies {
  config: HumanoConfig;
  conversations: ConversationRepository;
  memoryRepository: MemoryRepository;
  trainingEvents: TrainingEventRepository;
  subjectData: SubjectDataRepository;
  memory: MemoryEngine;
  emotions: EmotionEngine;
  personality: PersonalityEngine;
  planner: ConversationPlanner;
  prompts: PromptComposer;
  model: LanguageModelProvider;
  naturalness: NaturalnessFilter;
  adviceStyle: AdviceStyleFilter;
  validator: ResponseValidator;
  clock: Clock;
  ids: IdGenerator;
  tokens: TokenEstimator;
  observability: ObservabilitySink;
}

/**
 * Application orchestrator. It owns stage order but depends only on replaceable
 * ports, making each behavioral engine independently testable and swappable.
 */
export class HumanoConversationEngine {
  private readonly locks = new Map<string, Promise<void>>();

  constructor(private readonly dependencies: HumanoConversationEngineDependencies) {}

  async respond(input: {
    sessionId: SessionId;
    subjectId: SubjectId;
    message: string;
    mode?: ConversationMode;
    modelVariant?: ModelVariant;
  }): Promise<TurnResponse> {
    try {
      return await this.serialized(input.sessionId, () => this.runTurn(input));
    } catch (error) {
      this.dependencies.observability.emit("turn.failed", {
        sessionId: input.sessionId,
        error:
          error instanceof Error ? error.name : "UnknownConversationError",
      });
      throw error;
    }
  }

  async history(sessionId: SessionId) {
    return this.dependencies.conversations.listTurns(
      sessionId,
      this.dependencies.config.conversation.maxHistoryTurns,
    );
  }

  async newConversation(
    sessionId: SessionId,
    subjectId: SubjectId,
  ): Promise<void> {
    await this.dependencies.conversations.deleteSession(sessionId, subjectId);
  }

  async forgetSubject(subjectId: SubjectId): Promise<void> {
    await this.dependencies.memoryRepository.deleteForSubject(subjectId);
  }

  async deleteAllSubjectData(subjectId: SubjectId): Promise<void> {
    await this.dependencies.subjectData.deleteAllForSubject(subjectId);
    this.dependencies.observability.emit("subject.data_deleted", { subjectId });
  }

  async recordFeedback(input: {
    sessionId: SessionId;
    turnId: TurnId;
    rating: "positive" | "negative";
    note?: string;
  }): Promise<void> {
    const feedback: FeedbackRecord = {
      id: this.dependencies.ids.create(),
      sessionId: input.sessionId,
      turnId: input.turnId,
      rating: input.rating,
      note: input.note?.trim() || null,
      createdAt: this.dependencies.clock.now().toISOString(),
    };
    await this.dependencies.trainingEvents.addFeedback(feedback);
    this.dependencies.observability.emit("feedback.recorded", {
      sessionId: input.sessionId,
      turnId: input.turnId,
      rating: input.rating,
    });
  }

  private async runTurn(input: {
    sessionId: SessionId;
    subjectId: SubjectId;
    message: string;
    mode?: ConversationMode;
    modelVariant?: ModelVariant;
  }): Promise<TurnResponse> {
    const startedAt = Date.now();
    const now = this.dependencies.clock.now().toISOString();
    const traceId = this.dependencies.ids.create() as TraceId;
    const userTurnId = this.dependencies.ids.create() as TurnId;
    this.dependencies.observability.emit("turn.started", {
      traceId,
      sessionId: input.sessionId,
      inputCharacters: input.message.length,
    });

    await this.dependencies.conversations.ensureSession(
      input.sessionId,
      input.subjectId,
      now,
    );
    const history = await this.dependencies.conversations.listTurns(
      input.sessionId,
      this.dependencies.config.conversation.maxHistoryTurns,
    );
    await this.dependencies.conversations.appendTurn({
      id: userTurnId,
      sessionId: input.sessionId,
      role: "user",
      content: input.message,
      createdAt: now,
      estimatedTokens: this.dependencies.tokens.estimate(input.message),
    });

    const [emotions, memories] = await Promise.all([
      this.dependencies.emotions.analyze(input.message),
      this.dependencies.memory.retrieve(input.subjectId, input.message),
    ]);
    const plan = await this.dependencies.planner.plan({
      text: input.message,
      mode: input.mode ?? "standard",
      emotions,
      memories,
      history,
    });
    const modelVariant = input.modelVariant ?? "humano-1";
    const generationProfile =
      this.dependencies.config.generationProfiles[modelVariant];
    const prompt = this.dependencies.prompts.compose({
      userText: input.message,
      modelVariant,
      plan,
      emotions,
      memories,
      history,
      personality: this.dependencies.personality.snapshot(),
    });
    this.dependencies.observability.emit("planner.completed", {
      traceId,
      responseLength: plan.length.class,
      depthLevel: plan.depth.level,
      depthTask: plan.depth.taskKind,
      depthScore: plan.depth.score,
      depthSignalCount: plan.depth.signals.length,
      coverageCount: plan.depth.coverage.length,
      adviceDetected: plan.advice.detected,
      adviceMode: plan.advice.mode,
      adviceDomain: plan.advice.domain,
      adviceContextScore: plan.advice.context.score,
      adviceContextDimensionCount: plan.advice.context.present.length,
      adviceMissingContextCount: plan.advice.missingContext.length,
      adviceContinuedTurn: plan.advice.continuedAdviceTurn,
      minimumUsefulWords: plan.length.minimumUsefulWords,
      intent: plan.intent,
      questionMode: plan.question.mode,
      empathy: plan.empathy,
      stance: plan.stance.mode,
      memoryCount: prompt.selectedMemoryIds.length,
      estimatedInputTokens: prompt.estimatedInputTokens,
    });

    const generationRequest = {
      messages: prompt.messages,
      modelVariant,
      maxOutputTokens: Math.max(
        48,
        Math.round(
          plan.length.maxOutputTokens *
            generationProfile.outputTokenMultiplier,
        ),
      ),
      temperature: this.dependencies.config.provider.sampling.temperature,
      topP: this.dependencies.config.provider.sampling.topP,
      topK: this.dependencies.config.provider.sampling.topK,
      frequencyPenalty:
        this.dependencies.config.provider.sampling.frequencyPenalty,
      presencePenalty:
        this.dependencies.config.provider.sampling.presencePenalty,
      traceId,
      pseudonymousUserId: stableHash(input.subjectId).toString(36),
    };

    const firstGeneration =
      await this.dependencies.model.generate(generationRequest);
    const firstFiltered = await this.dependencies.naturalness.process(
      firstGeneration.content,
      plan,
    );
    const firstEvaluation = await this.dependencies.validator.evaluate({
      response: firstFiltered.content,
      userText: input.message,
      plan,
      emotions,
      memories,
      history,
    });
    const selected = await this.selectCandidate({
      firstGeneration,
      firstContent: firstFiltered.content,
      firstChanges: firstFiltered.changes,
      firstEvaluation,
      prompt,
      generationRequest,
      userText: input.message,
      plan,
      emotions,
      memories,
      history,
    });

    let finalContent = selected.content.trim();
    let finalEvaluation = selected.evaluation;
    let finalFilterChanges = selected.filterChanges;
    const adviceStyled = await this.dependencies.adviceStyle.process(
      finalContent,
      plan,
    );
    if (adviceStyled.changes.length > 0) {
      finalContent = adviceStyled.content.trim();
      finalFilterChanges = [
        ...finalFilterChanges,
        "used_advice_style_recovery",
        ...adviceStyled.changes,
      ];
      finalEvaluation = await this.dependencies.validator.evaluate({
        response: finalContent,
        userText: input.message,
        plan,
        emotions,
        memories,
        history,
      });
    }
    const unresolvedAdviceClarification =
      plan.advice.mode === "clarify_first" &&
      (finalEvaluation.scores.adviceReadinessFit <
        this.dependencies.config.validator.minimumAdviceReadinessFit ||
        finalEvaluation.hardViolations.includes(
          "missing_required_clarification",
        ) ||
        finalEvaluation.hardViolations.includes(
          "premature_personalized_advice",
        ));
    const unresolvedSocialFailure =
      plan.decisionTags.includes("SOCIAL_EXCHANGE") &&
      (!finalContent ||
        finalEvaluation.hardViolations.length > 0 ||
        finalEvaluation.action !== "accept");
    const unresolvedHumanState = finalEvaluation.hardViolations.includes(
      "incongruent_human_state_response",
    );
    let recoveryReason: string | null = null;
    if (unresolvedAdviceClarification) {
      finalContent =
        this.dependencies.config.planner.advice.clarificationFallbacks[
          plan.advice.domain
        ];
      recoveryReason = "used_advice_clarification_recovery";
    } else if (unresolvedHumanState && plan.humanState.primary) {
      const recoveryResponses = plan.humanState.primary.recoveryResponses;
      finalContent =
        recoveryResponses[stableHash(traceId) % recoveryResponses.length] ??
        recoveryResponses[0] ??
        this.dependencies.config.naturalness.fallbackResponse;
      recoveryReason = "used_human_state_recovery";
    } else if (unresolvedSocialFailure) {
      const recoveryResponses =
        this.dependencies.config.naturalness.socialRecoveryResponses;
      finalContent =
        recoveryResponses[stableHash(traceId) % recoveryResponses.length] ??
        recoveryResponses[0] ??
        this.dependencies.config.naturalness.fallbackResponse;
      recoveryReason = "used_social_recovery";
    } else if (!finalContent || finalEvaluation.hardViolations.length > 0) {
      finalContent = plan.decisionTags.includes("IDENTITY_TRANSPARENCY")
        ? this.dependencies.config.naturalness.identityFallbackResponse
        : this.dependencies.config.naturalness.fallbackResponse;
      recoveryReason = "used_safe_fallback";
    }
    if (recoveryReason) {
      finalFilterChanges = [...finalFilterChanges, recoveryReason];
      finalEvaluation = await this.dependencies.validator.evaluate({
        response: finalContent,
        userText: input.message,
        plan,
        emotions,
        memories,
        history,
      });
    }
    const assistantTurnId = this.dependencies.ids.create() as TurnId;
    const assistantNow = this.dependencies.clock.now().toISOString();
    await this.dependencies.conversations.appendTurn({
      id: assistantTurnId,
      sessionId: input.sessionId,
      role: "assistant",
      content: finalContent,
      createdAt: assistantNow,
      estimatedTokens: this.dependencies.tokens.estimate(finalContent),
    });

    await this.dependencies.memory.observe(
      input.subjectId,
      userTurnId,
      input.message,
      assistantNow,
    );
    const latencyMs = Date.now() - startedAt;
    await this.recordTrainingEvent({
      sessionId: input.sessionId,
      subjectId: input.subjectId,
      userTurnId,
      assistantTurnId,
      traceId,
      plan,
      emotions,
      memories,
      generation: selected.generation,
      modelVariant,
      candidate: firstFiltered.content,
      finalResponse: finalContent,
      filterChanges: finalFilterChanges,
      initialValidation: firstEvaluation,
      validation: finalEvaluation,
      selectionSource: finalFilterChanges.includes(
        "used_advice_clarification_recovery",
      )
        ? "advice_clarification_recovery"
        : finalFilterChanges.includes("used_human_state_recovery")
          ? "human_state_recovery"
        : finalFilterChanges.includes("used_advice_style_recovery")
          ? "advice_style_recovery"
        : finalFilterChanges.includes("used_social_recovery")
          ? "social_recovery"
          : finalFilterChanges.includes("used_safe_fallback")
            ? "safe_fallback"
            : finalFilterChanges.includes("model_revision")
              ? "revision_candidate"
              : "first_candidate",
      occurredAt: assistantNow,
    });
    this.dependencies.observability.emit("turn.completed", {
      traceId,
      sessionId: input.sessionId,
      provider: selected.generation.provider,
      model: selected.generation.model,
      latencyMs,
      promptTokens: selected.generation.usage.promptTokens,
      completionTokens: selected.generation.usage.completionTokens,
      validatorOverall: finalEvaluation.overall,
      validatorAction: finalEvaluation.action,
      answerSufficiency: finalEvaluation.scores.answerSufficiency,
      adviceReadinessFit: finalEvaluation.scores.adviceReadinessFit,
      consideredOpinionFit: finalEvaluation.scores.consideredOpinionFit,
      conversationalRegisterFit:
        finalEvaluation.scores.conversationalRegisterFit,
      adviceMode: plan.advice.mode,
      adviceDomain: plan.advice.domain,
      plannedDepth: plan.depth.level,
      plannedMinimumWords: plan.length.minimumUsefulWords,
      actualWords: countWords(finalContent),
      usedRevision: finalFilterChanges.includes("model_revision"),
      usedAdviceRecovery: finalFilterChanges.includes(
        "used_advice_clarification_recovery",
      ),
      usedAdviceStyleRecovery: finalFilterChanges.includes(
        "used_advice_style_recovery",
      ),
      memoryRetrieved: memories.length,
      modelVariant,
    });

    return {
      sessionId: input.sessionId,
      turnId: assistantTurnId,
      response: finalContent,
      trace: {
        traceId,
        plan,
        emotions,
        memoryCount: memories.length,
        validator: finalEvaluation,
        filterChanges: finalFilterChanges,
        latencyMs,
        provider: selected.generation.provider,
        model: selected.generation.model,
        modelVariant,
        tokenUsage: selected.generation.usage,
      },
    };
  }

  private async selectCandidate(input: {
    firstGeneration: GenerationResult;
    firstContent: string;
    firstChanges: string[];
    firstEvaluation: ResponseEvaluation;
    prompt: PromptEnvelope;
    generationRequest: Parameters<LanguageModelProvider["generate"]>[0];
    userText: string;
    plan: Parameters<ResponseValidator["evaluate"]>[0]["plan"];
    emotions: EmotionAssessment;
    memories: RetrievedMemory[];
    history: Parameters<ResponseValidator["evaluate"]>[0]["history"];
  }): Promise<{
    generation: GenerationResult;
    content: string;
    filterChanges: string[];
    evaluation: ResponseEvaluation;
  }> {
    const first = {
      generation: input.firstGeneration,
      content: input.firstContent,
      filterChanges: input.firstChanges,
      evaluation: input.firstEvaluation,
    };
    if (
      input.firstEvaluation.action === "accept" ||
      this.dependencies.config.validator.maxCandidates < 2 ||
      !this.dependencies.config.generationProfiles[
        input.generationRequest.modelVariant
      ].allowRevision ||
      (input.plan.mode === "debate" &&
        !this.dependencies.config.modes.debate.allowRevision)
    ) {
      return first;
    }

    const revisionPrompt = this.dependencies.prompts.composeRevision(
      input.prompt,
      input.firstContent,
      input.firstEvaluation,
    );
    const revisionGeneration = await this.dependencies.model.generate({
      ...input.generationRequest,
      messages: revisionPrompt.messages,
    });
    const revisionFiltered = await this.dependencies.naturalness.process(
      revisionGeneration.content,
      input.plan,
    );
    const revisionEvaluation = await this.dependencies.validator.evaluate({
      response: revisionFiltered.content,
      userText: input.userText,
      plan: input.plan,
      emotions: input.emotions,
      memories: input.memories,
      history: input.history,
    });
    const revision = {
      generation: revisionGeneration,
      content: revisionFiltered.content,
      filterChanges: [
        ...input.firstChanges,
        "model_revision",
        ...revisionFiltered.changes,
      ],
      evaluation: revisionEvaluation,
    };
    const firstIssues = new Set([
      ...input.firstEvaluation.hardViolations,
      ...input.firstEvaluation.revisionTags,
    ]);
    const revisionIssues = new Set([
      ...revisionEvaluation.hardViolations,
      ...revisionEvaluation.revisionTags,
    ]);
    const reducedRequestedIssues =
      revisionIssues.size < firstIssues.size &&
      [...firstIssues].some((issue) => !revisionIssues.has(issue));
    const scoreWithinRevisionTolerance =
      revisionEvaluation.overall +
        this.dependencies.config.validator.revisionScoreTolerance >=
      input.firstEvaluation.overall;
    const sufficiencyMateriallyImproved =
      revisionEvaluation.scores.answerSufficiency -
        input.firstEvaluation.scores.answerSufficiency >=
      this.dependencies.config.validator.sufficiencyImprovementThreshold;
    const adviceReadinessMateriallyImproved =
      revisionEvaluation.scores.adviceReadinessFit -
        input.firstEvaluation.scores.adviceReadinessFit >=
      this.dependencies.config.validator.adviceImprovementThreshold;
    const consideredOpinionMateriallyImproved =
      revisionEvaluation.scores.consideredOpinionFit -
        input.firstEvaluation.scores.consideredOpinionFit >=
      this.dependencies.config.validator.adviceImprovementThreshold;

    if (
      revisionEvaluation.hardViolations.length === 0 &&
      (input.firstEvaluation.hardViolations.length > 0 ||
        adviceReadinessMateriallyImproved ||
        consideredOpinionMateriallyImproved ||
        (reducedRequestedIssues && scoreWithinRevisionTolerance) ||
        (sufficiencyMateriallyImproved && scoreWithinRevisionTolerance) ||
        revisionEvaluation.overall >= input.firstEvaluation.overall)
    ) {
      return revision;
    }
    return first;
  }

  private async recordTrainingEvent(input: {
    sessionId: SessionId;
    subjectId: SubjectId;
    userTurnId: TurnId;
    assistantTurnId: TurnId;
    traceId: TraceId;
    plan: ConversationPlan;
    emotions: EmotionAssessment;
    memories: RetrievedMemory[];
    generation: GenerationResult;
    modelVariant: ModelVariant;
    candidate: string;
    finalResponse: string;
    filterChanges: string[];
    initialValidation: ResponseEvaluation;
    validation: ResponseEvaluation;
    selectionSource:
      | "first_candidate"
      | "revision_candidate"
      | "advice_clarification_recovery"
      | "advice_style_recovery"
      | "human_state_recovery"
      | "social_recovery"
      | "safe_fallback";
    occurredAt: string;
  }): Promise<void> {
    if (!this.dependencies.config.training.enabled) return;
    const storeContent = this.dependencies.config.training.storeRawContent;
    const marker = this.dependencies.config.training.redactionMarker;
    const selected = new Set<MemoryId>(input.plan.memory.ids);
    const event: TrainingEventV2 = {
      eventId: this.dependencies.ids.create(),
      eventType: "turn_completed",
      schemaVersion: this.dependencies.config.training.eventSchemaVersion,
      occurredAt: input.occurredAt,
      sessionId: input.sessionId,
      subjectId: input.subjectId,
      userTurnId: input.userTurnId,
      assistantTurnId: input.assistantTurnId,
      traceId: input.traceId,
      configSchemaVersion: this.dependencies.config.schemaVersion,
      behaviorVersion: this.dependencies.config.behaviorVersion,
      promptTemplateVersion: this.dependencies.config.promptTemplateVersion,
      depthAlgorithmVersion: input.plan.depth.algorithmVersion,
      adviceAlgorithmVersion: input.plan.advice.algorithmVersion,
      adviceStyleAlgorithmVersion:
        this.dependencies.config.adviceStyle.algorithmVersion,
      plan: input.plan,
      emotion: input.emotions,
      memoryCandidates: input.memories.map((candidate) => ({
        id: candidate.memory.id,
        kind: candidate.memory.kind,
        score: candidate.score,
        selected: selected.has(candidate.memory.id),
      })),
      generation: {
        provider: input.generation.provider,
        model: input.generation.model,
        modelVariant: input.modelVariant,
        finishReason: input.generation.finishReason,
        latencyMs: input.generation.latencyMs,
        usage: input.generation.usage,
      },
      candidate: storeContent
        ? redactSecrets(input.candidate, marker)
        : null,
      finalResponse: storeContent
        ? redactSecrets(input.finalResponse, marker)
        : null,
      filterChanges: input.filterChanges,
      initialValidation: input.initialValidation,
      validation: input.validation,
      selection: {
        source: input.selectionSource,
        revised: input.filterChanges.includes("model_revision"),
      },
      privacy: {
        rawContentStored: storeContent,
        hiddenReasoningStored: false,
        redactionPolicy: "secrets-and-identifiers",
      },
    };
    await this.dependencies.trainingEvents.append(event);
  }

  private async serialized<T>(
    key: SessionId,
    task: () => Promise<T>,
  ): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.locks.set(key, tail);
    try {
      return await run;
    } finally {
      if (this.locks.get(key) === tail) this.locks.delete(key);
    }
  }
}
