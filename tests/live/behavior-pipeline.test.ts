import assert from "node:assert/strict";
import test from "node:test";
import { loadHumanoConfig } from "../../src/humano/config/load-config";
import {
  CharacterTokenEstimator,
  CryptoIdGenerator,
  SystemClock,
} from "../../src/humano/core/runtime";
import type {
  SessionId,
  SubjectId,
} from "../../src/humano/domain/types";
import { OpenRouterProvider } from "../../src/humano/adapters/model/openrouter-provider";
import { NoopObservabilitySink } from "../../src/humano/adapters/observability/noop-observability-sink";
import { InMemoryRepository } from "../../src/humano/adapters/persistence/in-memory-repository";
import { HumanoConversationEngine } from "../../src/humano/application/humano-conversation-engine";
import { ConfigurableAdviceReadinessEngine } from "../../src/humano/engines/advice/configurable-advice-readiness-engine";
import { DeterministicAdviceStyleFilter } from "../../src/humano/engines/advice/deterministic-advice-style-filter";
import { AdaptiveConversationalDepthEngine } from "../../src/humano/engines/depth/adaptive-conversational-depth-engine";
import { HeuristicEmotionEngine } from "../../src/humano/engines/emotion/heuristic-emotion-engine";
import { ConfigurableHumanStateEngine } from "../../src/humano/engines/state/configurable-human-state-engine";
import { LexicalMemoryEngine } from "../../src/humano/engines/memory/lexical-memory-engine";
import { DeterministicNaturalnessFilter } from "../../src/humano/engines/naturalness/deterministic-naturalness-filter";
import { ConfiguredPersonalityEngine } from "../../src/humano/engines/personality/configured-personality-engine";
import { RuleConversationPlanner } from "../../src/humano/engines/planner/rule-conversation-planner";
import { ContextWindowManager } from "../../src/humano/engines/prompt/context-window-manager";
import { HumanoPromptComposer } from "../../src/humano/engines/prompt/humano-prompt-composer";
import { RuleResponseValidator } from "../../src/humano/engines/validator/rule-response-validator";

test(
  "live behavior pipeline keeps social turns brief, explanations sufficient, and advice context-aware",
  { skip: process.env.RUN_LIVE_MODEL_TESTS !== "1" },
  async () => {
    const key = process.env.OPENROUTER_API_KEY;
    assert.ok(key, "OPENROUTER_API_KEY is required for the live test");
    const config = loadHumanoConfig();
    const repository = new InMemoryRepository();
    const ids = new CryptoIdGenerator();
    const clock = new SystemClock();
    const tokens = new CharacterTokenEstimator(
      config.conversation.estimatedCharsPerToken,
    );
    const contextWindow = new ContextWindowManager(
      tokens,
      config.conversation,
    );
    const engine = new HumanoConversationEngine({
      config,
      conversations: repository,
      memoryRepository: repository,
      trainingEvents: repository,
      subjectData: repository,
      memory: new LexicalMemoryEngine(repository, ids, config.memory),
      emotions: new HeuristicEmotionEngine(config.emotion),
      personality: new ConfiguredPersonalityEngine(config.personality),
      planner: new RuleConversationPlanner(
        config.planner,
        new AdaptiveConversationalDepthEngine(config.planner.depth),
        new ConfigurableAdviceReadinessEngine(config.planner.advice),
        new ConfigurableHumanStateEngine(config.planner.humanState),
      ),
      prompts: new HumanoPromptComposer(contextWindow, config, clock),
      model: new OpenRouterProvider(key, config.provider),
      naturalness: new DeterministicNaturalnessFilter(config.naturalness),
      adviceStyle: new DeterministicAdviceStyleFilter(config.adviceStyle),
      validator: new RuleResponseValidator(
        config.naturalness,
        config.validator,
        config.planner,
        config.modes.debate,
      ),
      clock,
      ids,
      tokens,
      observability: new NoopObservabilitySink(),
    });

    const social = await engine.respond({
      sessionId: "11111111-aaaa-4aaa-8aaa-111111111111" as SessionId,
      subjectId: "22222222-bbbb-4bbb-8bbb-222222222222" as SubjectId,
      message: "How's it going?",
    });
    const explanation = await engine.respond({
      sessionId: "33333333-cccc-4ccc-8ccc-333333333333" as SessionId,
      subjectId: "44444444-dddd-4ddd-8ddd-444444444444" as SubjectId,
      message: "What does confirmation bias mean?",
    });
    const adviceSession =
      "55555555-eeee-4eee-8eee-555555555555" as SessionId;
    const adviceSubject =
      "66666666-ffff-4fff-8fff-666666666666" as SubjectId;
    const clarification = await engine.respond({
      sessionId: adviceSession,
      subjectId: adviceSubject,
      message: "What exercises should I do?",
    });
    const consideredAdvice = await engine.respond({
      sessionId: adviceSession,
      subjectId: adviceSubject,
      message:
        "I want to build strength, I'm a beginner, I have dumbbells at home, and I don't have any injuries.",
    });

    assert.equal(social.trace.plan.depth.level, "social");
    assert.ok(social.response.split(/\s+/u).length <= 36);
    assert.doesNotMatch(
      social.response,
      /just code|don't experience things|language model/iu,
    );
    assert.equal(explanation.trace.plan.depth.level, "explained");
    assert.ok(
      explanation.trace.validator.scores.answerSufficiency >=
        config.validator.minimumSufficiencyScore,
    );
    assert.match(explanation.response, /evidence|information|belief/iu);
    assert.doesNotMatch(
      explanation.response,
      new RegExp(config.naturalness.fallbackResponse, "iu"),
    );
    assert.equal(clarification.trace.plan.advice.mode, "clarify_first");
    assert.equal(clarification.trace.plan.question.mode, "required_clarification");
    assert.equal(clarification.response.match(/\?/gu)?.length, 1);
    assert.doesNotMatch(
      clarification.response,
      /\b(?:start with|you should|you need to|try)\b/iu,
    );
    assert.equal(
      consideredAdvice.trace.plan.advice.mode,
      "considered_opinion",
    );
    assert.equal(
      consideredAdvice.trace.plan.advice.continuedAdviceTurn,
      true,
    );
    assert.ok(
      consideredAdvice.trace.validator.scores.consideredOpinionFit >=
        config.validator.minimumConsideredOpinionFit,
    );
    assert.match(
      consideredAdvice.response,
      /\b(?:because|since|given|helps|reason|tradeoff|depends|target|build|effective|support)\w*\b/iu,
    );
  },
);
