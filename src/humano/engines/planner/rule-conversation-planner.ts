import type { HumanoConfig } from "../../config/schema";
import type {
  ConversationPlan,
  DecisionTag,
  ResponseFormat,
  ResponseLength,
} from "../../domain/types";
import type {
  AdviceReadinessEngine,
  ConversationPlanner,
  ConversationalDepthEngine,
  HumanStateEngine,
} from "../../ports/contracts";
import {
  countWords,
  includesAny,
  isWithinEditDistance,
  normalizeText,
} from "../../core/text";

/** Makes explicit conversational judgments before generation. */
export class RuleConversationPlanner implements ConversationPlanner {
  constructor(
    private readonly config: HumanoConfig["planner"],
    private readonly depthEngine: ConversationalDepthEngine,
    private readonly adviceEngine: AdviceReadinessEngine,
    private readonly humanStateEngine: HumanStateEngine,
  ) {}

  async plan(
    input: Parameters<ConversationPlanner["plan"]>[0],
  ): Promise<ConversationPlan> {
    const normalized = input.text.trim().toLocaleLowerCase();
    const normalizedSocialText = normalizeText(input.text);
    const wordCount = countWords(input.text);
    const directQuestion = input.text.includes("?");
    const requestedBrief = includesAny(
      normalized,
      this.config.explicitBrevityPatterns,
    );
    const requestedLong = includesAny(
      normalized,
      this.config.explicitLongPatterns,
    );
    const requestedDetail = includesAny(
      normalized,
      this.config.explicitDetailPatterns,
    );
    const identityQuestion = includesAny(
      normalized,
      this.config.identityPatterns,
    );
    const memoryQuestion = includesAny(
      normalized,
      this.config.memoryQuestionPatterns,
    );
    const acknowledgement = this.isAcknowledgement(normalized);
    const socialExchange = this.config.socialGreetingPatterns.some(
      (pattern) =>
        isWithinEditDistance(
          normalizedSocialText,
          pattern,
          this.config.socialGreetingMaxEditDistance,
        ),
    );
    const humorRequest = includesAny(
      normalized,
      this.config.humorRequestPatterns,
    );
    const choiceRequest =
      includesAny(normalized, this.config.choiceRequestPatterns) ||
      (wordCount <= this.config.shortChoiceOpinionMaxWords &&
        /\bor\b/iu.test(normalized));
    const requestedOpinion =
      includesAny(normalized, this.config.opinionRequestPatterns) ||
      choiceRequest;
    const frustration = input.emotions.probabilities.frustration;
    const sadness = input.emotions.probabilities.sadness;
    const urgency = input.emotions.probabilities.urgency;
    const excitement = input.emotions.probabilities.excitement;
    const confusion = input.emotions.probabilities.confusion;
    const uncertainty = input.emotions.probabilities.uncertainty;
    const referentAmbiguity =
      includesAny(normalized, this.config.clarificationPatterns) &&
      wordCount <= this.config.blockingAmbiguityWordThreshold &&
      input.history.length === 0;
    const advice = await this.adviceEngine.assess({
      text: input.text,
      history: input.history,
      urgency,
    });
    const humanState = await this.humanStateEngine.assess({ text: input.text });
    const stateDisclosure =
      humanState.primary !== null && !directQuestion;
    const adviceNeedsContext = advice.mode === "clarify_first";
    const materialAmbiguity = referentAmbiguity || adviceNeedsContext;
    const selectedMemories = input.memories
      .filter(
        (candidate) =>
          candidate.score >= this.config.memoryReferenceThreshold,
      )
      .slice(0, this.config.memorySelectionLimit);
    const empathy =
      sadness >= this.config.empathyThreshold ||
      frustration >= this.config.empathyThreshold
        ? "explicit"
        : sadness > 0.3 || frustration > 0.3
          ? "implicit"
          : "none";
    const emotionalDisclosure = empathy !== "none" && !directQuestion;
    const celebratoryDisclosure =
      excitement >= this.config.excitementThreshold &&
      !directQuestion &&
      humanState.primary?.valence !== "need" &&
      humanState.primary?.valence !== "discomfort" &&
      humanState.primary?.valence !== "support";
    const debateTurn =
      input.mode === "debate" &&
      !socialExchange &&
      !identityQuestion &&
      !humorRequest &&
      !materialAmbiguity &&
      humanState.primary === null &&
      sadness < this.config.empathyThreshold;
    const debateChoiceTurn = debateTurn && requestedOpinion;
    const depth = await this.depthEngine.assess({
      text: input.text,
      emotions: input.emotions,
      history: input.history,
      context: {
        socialExchange,
        acknowledgement,
        identityQuestion,
        humorRequest,
        materialAmbiguity,
        emotionalDisclosure,
        celebratoryDisclosure,
        directQuestion,
        requestedBrief,
        requestedDetail,
        requestedLong,
      },
      inheritedTaskKind: advice.continuedAdviceTurn
        ? "recommendation"
        : undefined,
    });
    const useConversationalOpinionBudget =
      requestedOpinion && !debateTurn && !requestedDetail && !requestedLong;
    const lengthBudget = debateTurn
      ? this.config.debate
      : useConversationalOpinionBudget
        ? this.config.opinion
      : depth.level === "social"
        ? this.config.social
        : this.config.depth.minimalTaskKinds.includes(depth.taskKind)
          ? this.config.minimal
          : depth.level === "concise"
            ? this.config.short
            : depth.level === "explained"
              ? this.config.medium
              : this.config.long;
    const lengthClass: ResponseLength =
      debateTurn
        ? "medium"
        : useConversationalOpinionBudget ||
            depth.level === "social" ||
            depth.level === "concise"
        ? "short"
        : depth.level === "explained"
          ? "medium"
          : "long";
    const length = { ...lengthBudget, class: lengthClass };
    const usefulFollowUp =
      debateTurn ||
      socialExchange ||
      emotionalDisclosure ||
      celebratoryDisclosure ||
      (stateDisclosure && humanState.primary?.allowFollowUp) ||
      depth.taskKind === "personal_sharing";
    const challenge = includesAny(normalized, this.config.challengePatterns);
    const format = this.chooseFormat(normalized);
    const decisionTags: DecisionTag[] = [];

    if (directQuestion) decisionTags.push("DIRECT_QUESTION");
    if (requestedBrief) decisionTags.push("USER_REQUESTED_BREVITY");
    if (requestedDetail || requestedLong) {
      decisionTags.push("USER_REQUESTED_DETAIL");
    }
    if (materialAmbiguity) decisionTags.push("MATERIAL_AMBIGUITY");
    if (adviceNeedsContext) {
      decisionTags.push("ADVICE_CONTEXT_REQUIRED");
    }
    if (advice.mode === "considered_opinion") {
      decisionTags.push("CONSIDERED_ADVICE");
    }
    if (advice.mode === "direct_guidance") {
      decisionTags.push("DIRECT_ADVICE");
    }
    if (stateDisclosure) decisionTags.push("HUMAN_STATE_DISCLOSURE");
    if (empathy !== "none") {
      decisionTags.push("EMOTIONAL_ACKNOWLEDGEMENT");
    }
    if (challenge) decisionTags.push("FACTUAL_CORRECTION");
    if (uncertainty > 0.55) decisionTags.push("LOW_CONFIDENCE");
    if (selectedMemories.length > 0) decisionTags.push("RELEVANT_MEMORY");
    if (urgency >= this.config.urgencyThreshold) decisionTags.push("URGENT");
    if (identityQuestion) decisionTags.push("IDENTITY_TRANSPARENCY");
    if (socialExchange) decisionTags.push("SOCIAL_EXCHANGE");
    if (humorRequest) decisionTags.push("HUMOR_REQUEST");
    if (requestedOpinion && !debateTurn) {
      decisionTags.push("USER_REQUESTED_OPINION");
    }
    if (choiceRequest) decisionTags.push("CHOICE_REQUEST");
    if (debateTurn) decisionTags.push("DEBATE_MODE");
    if (celebratoryDisclosure) decisionTags.push("POSITIVE_EVENT");
    if (!materialAmbiguity && !usefulFollowUp) {
      decisionTags.push("NO_QUESTION_NEEDED");
    }

    return {
      schemaVersion: "2.0",
      mode: debateTurn ? "debate" : "standard",
      intent: socialExchange
        ? "acknowledge"
        : materialAmbiguity
          ? "clarify"
          : acknowledgement
            ? "acknowledge"
            : celebratoryDisclosure
              ? "acknowledge"
              : stateDisclosure
                ? humanState.primary?.valence === "support"
                  ? "support"
                  : "acknowledge"
              : emotionalDisclosure
                ? "support"
                : depth.taskKind === "personal_sharing"
                  ? "explore"
                : "answer",
      answerFirst: !materialAmbiguity,
      length,
      depth,
      advice,
      humanState,
      tone: {
        warmth: socialExchange
          ? 0.7
          : empathy === "explicit"
            ? 0.82
            : empathy === "implicit"
              ? 0.68
              : stateDisclosure
                ? 0.66
              : 0.52,
        directness:
          debateTurn
            ? 0.98
            : socialExchange
            ? 0.66
            : urgency >= this.config.urgencyThreshold
            ? 0.96
            : confusion > 0.5
              ? 0.86
              : 0.8,
        energy: debateTurn
          ? 0.72
          : socialExchange
          ? 0.46
          : excitement >= this.config.excitementThreshold
            ? 0.68
            : urgency >= this.config.urgencyThreshold
              ? 0.54
              : 0.38,
        humor:
          humorRequest ||
          socialExchange ||
          (excitement > 0.45 &&
          sadness < 0.25 &&
          urgency < this.config.urgencyThreshold)
            ? "light"
            : "none",
      },
      question: {
        mode: debateTurn
          ? "useful_follow_up"
          : socialExchange
          ? "useful_follow_up"
          : materialAmbiguity
            ? "required_clarification"
            : celebratoryDisclosure || emotionalDisclosure
              ? "useful_follow_up"
              : stateDisclosure && humanState.primary?.allowFollowUp
                ? "useful_follow_up"
              : depth.taskKind === "personal_sharing"
                ? "useful_follow_up"
              : "none",
        purpose: debateTurn
          ? "End with exactly one short, pointed challenge about the user's central premise. Make them defend the disputed point; never ask a generic question."
          : socialExchange
          ? "Briefly reciprocate the social greeting if it feels natural."
          : adviceNeedsContext
            ? this.adviceQuestionPurpose(advice.questionFocus ?? [])
          : referentAmbiguity
            ? "Resolve the missing referent before giving a misleading answer."
            : celebratoryDisclosure
              ? "A specific follow-up about the good news is allowed if it adds warmth."
              : stateDisclosure
                ? humanState.primary?.responseInstruction ?? null
              : emotionalDisclosure
                ? "Invite the user to continue only if that feels supportive and natural."
                : depth.taskKind === "personal_sharing"
                  ? "Respond to what the user shared, then ask one specific question that helps them continue."
                : null,
      },
      stance: {
        mode: debateChoiceTurn
          ? "advocacy_debate"
          : debateTurn
            ? "adversarial_debate"
          : requestedOpinion
          ? "considered_opinion"
          : challenge
            ? "soft_disagree"
            : "neutral",
        confidence: debateTurn
          ? 0.88
          : requestedOpinion
            ? 0.76
            : challenge
              ? 0.78
              : 0.68,
      },
      empathy: debateTurn ? "none" : empathy,
      memory: {
        mode: memoryQuestion
          ? "answer_memory_question"
          : selectedMemories.length > 0
            ? "weave_implicitly"
            : "none",
        ids: selectedMemories.map((candidate) => candidate.memory.id),
      },
      uncertainty:
        uncertainty > 0.62
          ? "explicit"
          : uncertainty > 0.32
            ? "light"
            : "none",
      format,
      decisionTags: [...new Set(decisionTags)],
    };
  }

  private chooseFormat(text: string): ResponseFormat {
    if (includesAny(text, this.config.formatPatterns.code)) return "code";
    if (includesAny(text, this.config.formatPatterns.steps)) return "steps";
    if (includesAny(text, this.config.formatPatterns.bullets)) return "bullets";
    return "plain_prose";
  }

  private adviceQuestionPurpose(
    dimensions: NonNullable<
      ConversationPlan["advice"]["questionFocus"]
    >,
  ): string {
    const needs = dimensions.map(
      (dimension) => this.config.advice.clarificationInstructions[dimension],
    );
    return [
      "The recommendation depends on personal context.",
      ...needs,
      "Ask only that one thing in a compact, natural question with one question mark. This is a conversation, not a questionnaire. Do not recommend anything yet.",
    ].join(" ");
  }

  private isAcknowledgement(text: string): boolean {
    if (countWords(text) > 8) return false;
    return this.config.acknowledgementPatterns.some(
      (pattern) =>
        text === pattern ||
        text.startsWith(`${pattern} `) ||
        text.endsWith(` ${pattern}`),
    );
  }
}
