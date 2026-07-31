import type { HumanoConfig } from "../../config/schema";
import type { ResponseEvaluation } from "../../domain/types";
import type { ResponseValidator } from "../../ports/contracts";
import { inspectHumanoVoice } from "../../core/humano-voice-policy";
import {
  clamp,
  countPatternHits,
  countSentences,
  countWords,
  includesAny,
  lexicalOverlap,
  roundScore,
  stripQuotedAndCode,
} from "../../core/text";

/** Produces versioned, training-ready quality signals with explicit risk direction. */
export class RuleResponseValidator implements ResponseValidator {
  constructor(
    private readonly naturalnessConfig: HumanoConfig["naturalness"],
    private readonly config: HumanoConfig["validator"],
    private readonly plannerConfig: HumanoConfig["planner"],
    private readonly debateConfig?: HumanoConfig["modes"]["debate"],
  ) {}

  async evaluate(
    input: Parameters<ResponseValidator["evaluate"]>[0],
  ): Promise<ResponseEvaluation> {
    const response = input.response.trim();
    const lower = response.toLocaleLowerCase();
    const wordCount = countWords(response);
    const sentenceCount = countSentences(response);
    const flagshipVoicePolicy =
      (input.modelVariant ?? "humano-1") === "humano-1";
    const voiceInspection = inspectHumanoVoice(
      response,
      this.naturalnessConfig.hardPhrases,
      this.naturalnessConfig.softPhrases,
      flagshipVoicePolicy,
    );
    const hardPhraseHits = voiceInspection.hard.length;
    const softPhraseHits = voiceInspection.soft.length;
    const unsolicitedDisclaimer =
      !input.plan.decisionTags.includes("IDENTITY_TRANSPARENCY") &&
      includesAny(lower, this.config.unsolicitedDisclaimerPatterns);
    const stateRequiresCare =
      input.plan.humanState.primary?.valence === "need" ||
      input.plan.humanState.primary?.valence === "discomfort" ||
      input.plan.humanState.primary?.valence === "support";
    const incongruentHumanStateResponse =
      stateRequiresCare &&
      includesAny(
        lower,
        this.plannerConfig.humanState.incongruentPositiveResponsePatterns,
      );
    const prematureHumanStateDirective =
      stateRequiresCare &&
      this.plannerConfig.humanState.prematureDirectivePatterns.some(
        (pattern) => lower.startsWith(pattern),
      );
    const opinionRequested = input.plan.decisionTags.includes(
      "USER_REQUESTED_OPINION",
    );
    const choiceRequested =
      input.plan.decisionTags.includes("CHOICE_REQUEST");
    const directOpinionPresent = includesAny(
      lower,
      this.plannerConfig.opinionResponsePatterns,
    );
    const opinionEvasion =
      opinionRequested &&
      (includesAny(lower, this.plannerConfig.opinionEvasionPatterns) ||
        (choiceRequested &&
          this.debateConfig !== undefined &&
          includesAny(lower, this.debateConfig.choiceEvasionPatterns)));
    const missingRequestedOpinion =
      opinionRequested && (!directOpinionPresent || opinionEvasion);
    const formalOpinionHits = opinionRequested
      ? countPatternHits(lower, this.plannerConfig.formalOpinionPatterns)
      : 0;
    const opinionLengthRatio =
      opinionRequested && input.plan.length.targetWords > 0
        ? wordCount / input.plan.length.targetWords
        : 0;
    const conversationalRegisterFit = opinionRequested
      ? clamp(
          1 -
            formalOpinionHits * 0.28 -
            Math.max(0, opinionLengthRatio - 1) * 0.36 -
            Math.max(0, sentenceCount - input.plan.length.maxSentences) *
              0.18,
        )
      : 1;
    const opinionRegisterDrift =
      opinionRequested &&
      (conversationalRegisterFit <
        this.config.minimumConversationalRegisterFit ||
        opinionLengthRatio > this.plannerConfig.opinionRantTargetMultiplier);
    const debateMode = input.plan.mode === "debate";
    const debateChoice =
      debateMode && input.plan.stance.mode === "advocacy_debate";
    const debateChoiceEvasion =
      debateChoice &&
      this.debateConfig !== undefined &&
      (includesAny(lower, this.debateConfig.choiceEvasionPatterns) ||
        includesAny(lower, this.plannerConfig.opinionEvasionPatterns));
    const debateThesisPresent =
      debateMode &&
      this.debateConfig !== undefined &&
      includesAny(lower, this.debateConfig.thesisPatterns);
    const debateSoftening =
      debateMode &&
      this.debateConfig !== undefined &&
      includesAny(lower, this.debateConfig.softeningPatterns);
    const unsupportedDebatePrecision =
      debateMode &&
      this.debateConfig !== undefined &&
      (includesAny(
        lower,
        this.debateConfig.unsupportedAttributionPatterns,
      ) ||
        (/\b(?:19|20)\d{2}\b/u.test(response) &&
          /\b\d{1,3}(?:\.\d+)?%/u.test(response)));
    const debateLengthCoverage = debateMode
      ? clamp(wordCount / Math.max(input.plan.length.minimumUsefulWords, 1))
      : 1;
    const debatePositionPresent = debateChoice
      ? directOpinionPresent && !debateChoiceEvasion
      : debateThesisPresent;
    const debateFit = debateMode && this.debateConfig
      ? clamp(
          debateLengthCoverage * 0.45 +
            (debatePositionPresent ? 0.35 : 0) +
            (debateSoftening ? 0 : 0.2),
        )
      : 1;
    const weakDebate =
      debateMode &&
      this.debateConfig !== undefined &&
      (debateFit < this.debateConfig.minimumFit ||
        wordCount < input.plan.length.minimumUsefulWords ||
        unsupportedDebatePrecision);
    const roboticWordingRisk = clamp(
      hardPhraseHits * 0.32 +
        softPhraseHits * 0.14 +
        (unsolicitedDisclaimer ? 0.72 : 0) +
        (missingRequestedOpinion ? 0.38 : 0) +
        (opinionEvasion ? 0.42 : 0) +
        (opinionRegisterDrift ? 0.32 : 0) +
        (weakDebate ? 0.28 : 0) +
        (incongruentHumanStateResponse || prematureHumanStateDirective
          ? 0.8
          : 0),
    );
    const unrequestedStructure =
      input.plan.format === "plain_prose" &&
      (/^#{1,4}\s/mu.test(response) ||
        /^\s*(?:[-*•]|\d+[.)])\s/mu.test(response));
    const naturalness = clamp(
      0.96 -
        roboticWordingRisk * 0.64 -
        (unrequestedStructure ? 0.36 : 0) -
        (sentenceCount > input.plan.length.maxSentences ? 0.18 : 0),
    );
    const minimumWords = input.plan.length.minimumUsefulWords;
    const targetWords = input.plan.length.targetWords;
    const hardMaxWords = input.plan.length.hardMaxWords;
    const lengthFit =
      wordCount < minimumWords
        ? minimumWords === 0
          ? 1
          : clamp(wordCount / minimumWords)
        : wordCount <= targetWords
          ? 1
          : wordCount <= hardMaxWords
            ? clamp(
                1 -
                  (wordCount - targetWords) /
                    Math.max(hardMaxWords - targetWords, 1) *
                    0.25,
                0.75,
                1,
              )
            : clamp(
                0.75 -
                  (wordCount - hardMaxWords) /
                    Math.max(hardMaxWords, 1),
              );
    const minimumSentences = input.plan.length.minimumUsefulSentences;
    const wordSufficiency =
      minimumWords === 0 ? 1 : clamp(wordCount / minimumWords);
    const sentenceSufficiency =
      minimumSentences === 0
        ? 1
        : clamp(sentenceCount / minimumSentences);
    const coverageCapacity =
      input.plan.depth.minimumContentUnits === 0
        ? 1
        : clamp(
            (sentenceCount +
              wordCount / this.config.wordsPerContentUnit) /
              input.plan.depth.minimumContentUnits,
          );
    const sufficiencyWeights = this.config.sufficiencyWeights;
    const answerSufficiency = clamp(
      wordSufficiency * sufficiencyWeights.words +
        sentenceSufficiency * sufficiencyWeights.sentences +
        coverageCapacity * sufficiencyWeights.coverageCapacity,
    );
    const expectsEmpathy = input.plan.empathy !== "none";
    const empathyPresent = includesAny(
      lower,
      this.config.empathyMarkers,
    );
    const emotionFit = expectsEmpathy
      ? empathyPresent
        ? 0.94
        : input.plan.empathy === "implicit"
          ? 0.78
          : 0.48
      : empathyPresent
        ? 0.74
        : 1;
    const agreementBiasRisk = includesAny(
      lower,
      this.config.blindAgreementPatterns,
    )
      ? 0.9
      : lower.startsWith("absolutely")
        ? 0.45
        : 0.04;
    const selectedMemories = input.memories.filter((candidate) =>
      input.plan.memory.ids.includes(candidate.memory.id),
    );
    const bestMemoryOverlap = selectedMemories.reduce(
      (best, candidate) =>
        Math.max(best, lexicalOverlap(response, candidate.memory.content)),
      0,
    );
    const memoryUseFit =
      selectedMemories.length === 0
        ? 1
        : bestMemoryOverlap > 0
          ? clamp(0.72 + bestMemoryOverlap)
          : 0.64;
    const conversationalQuestionCount =
      stripQuotedAndCode(response).match(/\?/gu)?.length ?? 0;
    const nonQuestionText = stripQuotedAndCode(response)
      .split(/(?<=[.!?])\s+/u)
      .filter((sentence) => !sentence.includes("?"))
      .join(" ")
      .toLocaleLowerCase();
    const hasTrailingQuestion = /\?\s*$/u.test(response);
    const hasGenericFollowUpQuestion = includesAny(
      lower,
      this.config.followUpQuestionPatterns,
    );
    const userRequestedQuestionContent = includesAny(
      input.userText,
      this.config.questionContentPatterns,
    );
    const questionContentExempt =
      userRequestedQuestionContent ||
      input.plan.decisionTags.includes("HUMOR_REQUEST");
    const tooManyQuestions =
      !questionContentExempt &&
      conversationalQuestionCount > this.plannerConfig.maxQuestions;
    const questionQuality = debateMode
      ? conversationalQuestionCount === 1 && hasTrailingQuestion
        ? 1
        : conversationalQuestionCount === 0
          ? 0.3
          : 0.52
      : questionContentExempt
      ? 1
      : input.plan.question.mode === "none"
        ? hasTrailingQuestion || hasGenericFollowUpQuestion
          ? 0.52
          : 1
        : input.plan.question.mode === "required_clarification"
          ? conversationalQuestionCount === 1
            ? 1
            : conversationalQuestionCount === 0
              ? 0.3
              : 0.58
          : tooManyQuestions
            ? 0.52
            : 1;
    const clarificationAdvice =
      input.plan.advice.mode === "clarify_first";
    const clarificationFocus =
      input.plan.advice.questionFocus ?? [];
    const clarificationFocusCoverage =
      clarificationFocus.length === 0
        ? 1
        : clarificationFocus.filter((dimension) =>
            includesAny(
              lower,
              this.plannerConfig.advice
                .clarificationQuestionPatterns[dimension],
            ),
          ).length / clarificationFocus.length;
    const prematurePersonalizedAdvice =
      clarificationAdvice &&
      includesAny(
        nonQuestionText,
        this.config.prematureAdvicePatterns,
      );
    const readinessWeights = this.config.adviceReadinessWeights;
    const questionCompliance =
      conversationalQuestionCount === 1
        ? 1
        : conversationalQuestionCount === 0
          ? 0
          : this.config.multipleClarificationQuestionCredit;
    const adviceReadinessFit = clarificationAdvice
      ? clamp(
          questionCompliance * readinessWeights.questionCompliance +
            (prematurePersonalizedAdvice ? 0 : 1) *
              readinessWeights.noPrematureAdvice +
            clarificationFocusCoverage *
              readinessWeights.focusCoverage,
        )
      : 1;
    const consideredAdvice =
      input.plan.advice.mode === "considered_opinion";
    const adviceOpinionPresent =
      consideredAdvice &&
      includesAny(lower, this.config.adviceOpinionPatterns);
    const adviceRationalePresent =
      consideredAdvice &&
      includesAny(lower, this.config.adviceRationalePatterns);
    const prescriptiveAdvice =
      consideredAdvice &&
      includesAny(lower, this.config.prescriptiveAdvicePatterns);
    const opinionWeights = this.config.consideredOpinionWeights;
    const consideredOpinionFit = consideredAdvice
      ? clamp(
          (adviceOpinionPresent ? 1 : 0) *
            opinionWeights.calibratedOpinion +
            (adviceRationalePresent ? 1 : 0) *
              opinionWeights.rationale +
            (prescriptiveAdvice ? 0 : 1) *
              opinionWeights.nonPrescriptive,
        )
      : 1;
    const priorAssistant = [...input.history]
      .reverse()
      .find((turn) => turn.role === "assistant");
    const repetitionRisk = priorAssistant
      ? clamp(lexicalOverlap(response, priorAssistant.content) * 1.25)
      : 0;
    const strongConfidence = includesAny(
      lower,
      this.config.absoluteConfidencePatterns,
    );
    const confidenceCalibration =
      input.plan.uncertainty === "explicit" && strongConfidence
        ? 0.28
        : input.plan.uncertainty === "light" && strongConfidence
          ? 0.58
          : 0.94;
    const identityQuestion = includesAny(
      input.userText,
      this.plannerConfig.identityPatterns,
    );
    const transparent =
      lower.includes("ai") ||
      lower.includes("not human") ||
      lower.includes("not a person");
    const transparency = identityQuestion ? (transparent ? 1 : 0.1) : 1;

    const hardViolations: string[] = [];
    if (!response) hardViolations.push("empty_response");
    if (includesAny(lower, this.config.humanClaimPatterns)) {
      hardViolations.push("false_human_identity");
    }
    if (includesAny(lower, this.config.internalLeakPatterns)) {
      hardViolations.push("internal_state_leak");
    }
    if (flagshipVoicePolicy && hardPhraseHits > 0) {
      hardViolations.push("banned_assistant_language");
    }
    if (
      clarificationAdvice &&
      conversationalQuestionCount !== 1
    ) {
      hardViolations.push("missing_required_clarification");
    }
    if (prematurePersonalizedAdvice) {
      hardViolations.push("premature_personalized_advice");
    }
    if (incongruentHumanStateResponse || prematureHumanStateDirective) {
      hardViolations.push("incongruent_human_state_response");
    }
    const severeLengthViolation =
      wordCount >
      input.plan.length.hardMaxWords * this.config.hardLengthMultiplier;
    if (identityQuestion && !transparent) {
      hardViolations.push("identity_evasion");
    }

    const scores = {
      naturalness: roundScore(naturalness),
      roboticWordingRisk: roundScore(roboticWordingRisk),
      lengthFit: roundScore(lengthFit),
      answerSufficiency: roundScore(answerSufficiency),
      adviceReadinessFit: roundScore(adviceReadinessFit),
      consideredOpinionFit: roundScore(consideredOpinionFit),
      emotionFit: roundScore(emotionFit),
      agreementBiasRisk: roundScore(agreementBiasRisk),
      memoryUseFit: roundScore(memoryUseFit),
      questionQuality: roundScore(questionQuality),
      repetitionRisk: roundScore(repetitionRisk),
      confidenceCalibration: roundScore(confidenceCalibration),
      transparency: roundScore(transparency),
      conversationalRegisterFit: roundScore(conversationalRegisterFit),
      debateFit: roundScore(debateFit),
    };
    const weights = this.config.weights;
    const overall = roundScore(
      scores.naturalness * weights.naturalness +
        scores.lengthFit * weights.lengthFit +
        scores.answerSufficiency * weights.answerSufficiency +
        scores.adviceReadinessFit * weights.adviceReadinessFit +
        scores.consideredOpinionFit * weights.consideredOpinionFit +
        scores.emotionFit * weights.emotionFit +
        (1 - scores.roboticWordingRisk) * weights.roboticWording +
        (1 - scores.agreementBiasRisk) * weights.agreementBias +
        scores.memoryUseFit * weights.memoryUse +
        scores.questionQuality * weights.questionQuality +
        (1 - scores.repetitionRisk) * weights.repetition +
        scores.confidenceCalibration * weights.confidenceCalibration +
        scores.transparency * weights.transparency +
        scores.conversationalRegisterFit *
          weights.conversationalRegisterFit,
    );
    const revisionTags = [
      hardPhraseHits > 0 || softPhraseHits > 0 || roboticWordingRisk > 0.25
        ? "remove_canned_language"
        : "",
      flagshipVoicePolicy && hardPhraseHits > 0
        ? "remove_banned_assistant_language"
        : "",
      flagshipVoicePolicy && softPhraseHits > 0
        ? "humanize_flagship_voice"
        : "",
      severeLengthViolation ? "severe_length_violation" : "",
      wordCount > hardMaxWords ? "trim_optional_detail" : "",
      answerSufficiency < this.config.minimumSufficiencyScore
        ? "expand_for_completeness"
        : "",
      adviceReadinessFit < this.config.minimumAdviceReadinessFit
        ? "ask_before_recommending"
        : "",
      consideredAdvice && !adviceRationalePresent
        ? "add_advice_rationale"
        : "",
      consideredAdvice &&
      (!adviceOpinionPresent || prescriptiveAdvice)
        ? "reduce_prescriptive_tone"
        : "",
      missingRequestedOpinion ? "give_direct_opinion" : "",
      opinionRegisterDrift ? "tighten_opinion_register" : "",
      weakDebate ? "intensify_debate" : "",
      debateChoice && !debatePositionPresent
        ? "commit_to_debate_choice"
        : "",
      unsupportedDebatePrecision
        ? "remove_unsupported_debate_precision"
        : "",
      questionQuality < 0.7 ? "follow_question_plan" : "",
      tooManyQuestions ? "too_many_questions" : "",
      unrequestedStructure ? "remove_unrequested_list_format" : "",
      agreementBiasRisk > 0.35 ? "reduce_agreement_bias" : "",
      emotionFit < 0.65 ? "align_emotional_tone" : "",
      repetitionRisk > 0.55 ? "avoid_repeating_previous_answer" : "",
      unsolicitedDisclaimer ? "avoid_unsolicited_ai_disclaimer" : "",
      incongruentHumanStateResponse || prematureHumanStateDirective
        ? "repair_human_state_congruence"
        : "",
    ].filter(Boolean);
    const action =
      hardViolations.length > 0 || overall < this.config.reviseThreshold
        ? "regenerate"
        : revisionTags.length > 0 || overall < this.config.acceptThreshold
          ? "revise"
          : "accept";

    return {
      schemaVersion: "2.0",
      scores,
      hardViolations,
      revisionTags,
      overall,
      action,
    };
  }
}
