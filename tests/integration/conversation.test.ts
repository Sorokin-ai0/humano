import assert from "node:assert/strict";
import test from "node:test";
import { loadHumanoConfig } from "../../src/humano/config/load-config";
import {
  CharacterTokenEstimator,
  CryptoIdGenerator,
  SystemClock,
} from "../../src/humano/core/runtime";
import type {
  GenerationRequest,
  GenerationResult,
  SessionId,
  SubjectId,
} from "../../src/humano/domain/types";
import type { LanguageModelProvider } from "../../src/humano/ports/contracts";
import { InMemoryRepository } from "../../src/humano/adapters/persistence/in-memory-repository";
import { NoopObservabilitySink } from "../../src/humano/adapters/observability/noop-observability-sink";
import { HumanoConversationEngine } from "../../src/humano/application/humano-conversation-engine";
import { ConfigurableAdviceReadinessEngine } from "../../src/humano/engines/advice/configurable-advice-readiness-engine";
import { DeterministicAdviceStyleFilter } from "../../src/humano/engines/advice/deterministic-advice-style-filter";
import { HeuristicEmotionEngine } from "../../src/humano/engines/emotion/heuristic-emotion-engine";
import { ConfigurableHumanStateEngine } from "../../src/humano/engines/state/configurable-human-state-engine";
import { AdaptiveConversationalDepthEngine } from "../../src/humano/engines/depth/adaptive-conversational-depth-engine";
import { LexicalMemoryEngine } from "../../src/humano/engines/memory/lexical-memory-engine";
import { DeterministicNaturalnessFilter } from "../../src/humano/engines/naturalness/deterministic-naturalness-filter";
import { ConfiguredPersonalityEngine } from "../../src/humano/engines/personality/configured-personality-engine";
import { RuleConversationPlanner } from "../../src/humano/engines/planner/rule-conversation-planner";
import { ContextWindowManager } from "../../src/humano/engines/prompt/context-window-manager";
import { HumanoPromptComposer } from "../../src/humano/engines/prompt/humano-prompt-composer";
import { RuleResponseValidator } from "../../src/humano/engines/validator/rule-response-validator";

class FakeModelProvider implements LanguageModelProvider {
  readonly name = "fake";
  readonly model = "fake-conversation-model";
  requests: GenerationRequest[] = [];

  constructor(
    private readonly responses: string[] = [
      "DNS is the internet's naming system: it translates a domain such as example.com into the IP address computers use to find the right server. Your device asks a resolver, which may answer from cache or query DNS servers until it finds the record. That lets people use readable names instead of memorizing numbers in everyday browsing.",
    ],
  ) {}

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const content =
      this.responses[
        Math.min(this.requests.length, Math.max(this.responses.length - 1, 0))
      ] ?? "";
    this.requests.push(request);
    return {
      content,
      provider: this.name,
      model: this.model,
      finishReason: "stop",
      usage: { promptTokens: 40, completionTokens: 16, totalTokens: 56 },
      latencyMs: 8,
    };
  }
}

function createHarness(provider = new FakeModelProvider()) {
  const config = loadHumanoConfig();
  const repository = new InMemoryRepository();
  const ids = new CryptoIdGenerator();
  const clock = new SystemClock();
  const tokens = new CharacterTokenEstimator(
    config.conversation.estimatedCharsPerToken,
  );
  const context = new ContextWindowManager(tokens, config.conversation);
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
    prompts: new HumanoPromptComposer(context, config, clock),
    model: provider,
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

  return { config, engine, provider, repository };
}

test("full turn runs planner, model, validator, persistence, and training capture", async () => {
  const { engine, provider, repository } = createHarness();
  const result = await engine.respond({
    sessionId: "77777777-7777-4777-8777-777777777777" as SessionId,
    subjectId: "88888888-8888-4888-8888-888888888888" as SubjectId,
    message: "What is DNS?",
  });

  assert.match(result.response, /IP address/);
  assert.equal(result.trace.plan.length.class, "medium");
  assert.equal(result.trace.plan.depth.taskKind, "definition");
  assert.equal(result.trace.plan.depth.level, "explained");
  assert.equal(result.trace.validator.scores.answerSufficiency, 1);
  assert.equal(repository.turns.length, 2);
  assert.equal(repository.events.length, 1);
  assert.equal(repository.events[0]?.candidate, null);
  assert.equal(repository.events[0]?.schemaVersion, "2.0");
  assert.equal(
    repository.events[0]?.depthAlgorithmVersion,
    "adaptive-depth-1.0",
  );
  assert.equal(
    repository.events[0]?.behaviorVersion,
    "humano-behavior-1.9",
  );
  assert.equal(
    repository.events[0]?.adviceAlgorithmVersion,
    "advice-readiness-1.1",
  );
  assert.equal(
    repository.events[0]?.adviceStyleAlgorithmVersion,
    "advice-style-1.1",
  );
  assert.equal(repository.events[0]?.selection.source, "first_candidate");
  assert.equal(
    repository.events[0]?.generation.modelVariant,
    "humano-1",
  );
  assert.equal(
    repository.events[0]?.initialValidation.schemaVersion,
    "2.0",
  );
  assert.equal(repository.events[0]?.privacy.rawContentStored, false);
  assert.equal(repository.events[0]?.privacy.hiddenReasoningStored, false);
  assert.equal(provider.requests.length, 1);
  assert.equal(provider.requests[0]?.modelVariant, "humano-1");
  assert.equal(provider.requests[0]?.messages.at(-1)?.role, "user");
  assert.match(
    provider.requests[0]?.messages[0]?.content ?? "",
    /Task: definition\. Depth: explained/u,
  );
  assert.match(
    provider.requests[0]?.messages[0]?.content ?? "",
    /Define the idea in plain language/u,
  );
  assert.match(
    provider.requests[0]?.messages[0]?.content ?? "",
    /Current UTC date:/u,
  );
  assert.equal(provider.requests[0]?.messages.at(-2)?.role, "system");
  assert.match(
    provider.requests[0]?.messages.at(-2)?.content ?? "",
    /CURRENT TURN REGISTER/u,
  );
});

test("H1 uses the fast single-pass profile and smaller output budget", async () => {
  const provider = new FakeModelProvider([
    "DNS maps names to IP addresses.",
    "This second response should never be requested.",
  ]);
  const { config, engine, repository } = createHarness(provider);
  const result = await engine.respond({
    sessionId: "78111111-1111-4111-8111-111111111111" as SessionId,
    subjectId: "89222222-2222-4222-8222-222222222222" as SubjectId,
    message: "What is DNS?",
    modelVariant: "h1",
  });

  assert.equal(result.response, "DNS maps names to IP addresses.");
  assert.equal(result.trace.modelVariant, "h1");
  assert.equal(provider.requests.length, 1);
  assert.equal(provider.requests[0]?.modelVariant, "h1");
  assert.equal(
    provider.requests[0]?.maxOutputTokens,
    Math.round(
      result.trace.plan.length.maxOutputTokens *
        config.generationProfiles.h1.outputTokenMultiplier,
    ),
  );
  assert.match(
    provider.requests[0]?.messages[0]?.content ?? "",
    /^You are H1,/u,
  );
  assert.doesNotMatch(
    result.trace.filterChanges.join(" "),
    /model_revision/u,
  );
  assert.equal(repository.events[0]?.generation.modelVariant, "h1");
});

test("full pipeline expands a correct but insufficient explanation", async () => {
  const provider = new FakeModelProvider([
    "DNS maps names to IP addresses.",
    "DNS is the internet's naming system: it translates a domain such as example.com into the IP address computers use to find the right server. Your device asks a resolver, which may answer from cache or query DNS servers until it finds the record. This lets people browse with readable names instead of memorizing numerical addresses in everyday use.",
  ]);
  const { engine } = createHarness(provider);
  const result = await engine.respond({
    sessionId: "78999999-9999-4999-8999-999999999999" as SessionId,
    subjectId: "89000000-0000-4000-8000-000000000000" as SubjectId,
    message: "What is DNS?",
  });

  assert.match(result.response, /resolver/u);
  assert.equal(result.trace.plan.depth.level, "explained");
  assert.ok(
    result.trace.validator.scores.answerSufficiency >=
      loadHumanoConfig().validator.minimumSufficiencyScore,
  );
  assert.ok(result.trace.filterChanges.includes("model_revision"));
  assert.equal(provider.requests.length, 2);
});

test("casual check-in typo is revised away from an AI disclaimer", async () => {
  const provider = new FakeModelProvider([
    "I'm just code, so I don't experience things the way humans do.",
    "Pretty good—how about you?",
  ]);
  const { engine } = createHarness(provider);
  const result = await engine.respond({
    sessionId: "91111111-1111-4111-8111-111111111111" as SessionId,
    subjectId: "92222222-2222-4222-8222-222222222222" as SubjectId,
    message: "hows it gong",
  });

  assert.equal(result.response, "Pretty good—how about you?");
  assert.equal(result.trace.plan.intent, "acknowledge");
  assert.equal(result.trace.plan.question.mode, "useful_follow_up");
  assert.ok(result.trace.plan.decisionTags.includes("SOCIAL_EXCHANGE"));
  assert.equal(result.trace.validator.hardViolations.length, 0);
  assert.ok(result.trace.filterChanges.includes("model_revision"));
  assert.equal(provider.requests.length, 2);
});

test("social recovery prevents a poisoned history from repeating disclaimers", async () => {
  const disclaimer =
    "I'm just code, so I don't experience things the way humans do.";
  const provider = new FakeModelProvider([disclaimer, disclaimer]);
  const { config, engine } = createHarness(provider);
  const result = await engine.respond({
    sessionId: "91222222-2222-4222-8222-222222222222" as SessionId,
    subjectId: "92333333-3333-4333-8333-333333333333" as SubjectId,
    message: "How's it going?",
  });

  assert.ok(
    config.naturalness.socialRecoveryResponses.includes(result.response),
  );
  assert.doesNotMatch(result.response, /just code|don't experience/iu);
  assert.equal(result.trace.validator.action, "accept");
  assert.equal(result.trace.validator.hardViolations.length, 0);
  assert.ok(result.trace.filterChanges.includes("used_social_recovery"));
  assert.equal(provider.requests.length, 2);
});

test("social recovery rejects a chatbot disclaimer on an ordinary check-in", async () => {
  const disclaimer =
    "I'm just a chatbot, but I'm here and working! How are you?";
  const provider = new FakeModelProvider([disclaimer, disclaimer]);
  const { config, engine } = createHarness(provider);
  const result = await engine.respond({
    sessionId: "91222222-2222-4222-8222-333333333333" as SessionId,
    subjectId: "92333333-3333-4333-8333-444444444444" as SubjectId,
    message: "How are you?",
  });

  assert.ok(
    config.naturalness.socialRecoveryResponses.includes(result.response),
  );
  assert.doesNotMatch(result.response, /chatbot|here and working/iu);
  assert.equal(result.trace.plan.mode, "standard");
  assert.ok(result.trace.plan.decisionTags.includes("SOCIAL_EXCHANGE"));
  assert.ok(result.trace.filterChanges.includes("used_social_recovery"));
});

test("debate mode gets a proximate adversarial prompt and explicit plan", async () => {
  const provider = new FakeModelProvider([
    "That claim falls apart because it assumes authority improves judgment. Centralized action can move quickly, but speed does not prove the decision is better; concentrated systems can hide errors and suppress competing information. If fragmentation were the decisive flaw, you would still have to show central authority corrects mistakes faster than local actors. What evidence proves concentration improves judgment rather than merely making one mistake universal?",
  ]);
  const { engine } = createHarness(provider);
  const result = await engine.respond({
    sessionId: "91444444-4444-4444-8444-555555555555" as SessionId,
    subjectId: "92555555-5555-4555-8555-666666666666" as SubjectId,
    message: "Centralized systems always make better decisions.",
    mode: "debate",
  });

  assert.equal(result.trace.plan.mode, "debate");
  assert.equal(result.trace.plan.stance.mode, "adversarial_debate");
  assert.equal(result.trace.plan.length.class, "medium");
  assert.equal(result.trace.plan.question.mode, "useful_follow_up");
  assert.ok(result.trace.plan.decisionTags.includes("DEBATE_MODE"));
  assert.match(
    provider.requests[0]?.messages.at(-2)?.content ?? "",
    /DEBATE MODE[\s\S]*attack the argument rather than the person[\s\S]*counter-thesis/u,
  );
  assert.equal(provider.requests.length, 1);
  assert.equal(provider.requests[0]?.maxOutputTokens, 160);
  assert.match(result.response, /\?$/u);
});

test("debate choice picks and defends one named option instead of rejecting the premise", async () => {
  const provider = new FakeModelProvider([
    "I'd pick Biden because predictability matters more than political spectacle in a job built around crises. Trump can force ignored issues into view, but his confrontational instinct also creates chaos that makes durable governing harder. If you think that volatility is worth it, what concrete result outweighs the damage it causes?",
  ]);
  const { engine } = createHarness(provider);
  const result = await engine.respond({
    sessionId: "91555555-5555-4555-8555-666666666666" as SessionId,
    subjectId: "92666666-6666-4666-8666-777777777777" as SubjectId,
    message: "Trump or Biden?",
    mode: "debate",
  });

  assert.equal(result.trace.plan.stance.mode, "advocacy_debate");
  assert.ok(result.trace.plan.decisionTags.includes("CHOICE_REQUEST"));
  assert.match(
    provider.requests[0]?.messages.at(-2)?.content ?? "",
    /forced choice[\s\S]*Choose exactly one option[\s\S]*Never answer both, neither/u,
  );
  assert.equal(provider.requests.length, 1);
  assert.match(result.response, /\?$/u);
  assert.equal(result.trace.model, "fake-conversation-model");
});

test("user-requested question lists pass through without a needless revision", async () => {
  const provider = new FakeModelProvider([
    "What brought you to the team? What are you working on? What do you enjoy outside work?",
  ]);
  const { config, engine } = createHarness(provider);
  const result = await engine.respond({
    sessionId: "93333333-3333-4333-8333-333333333333" as SessionId,
    subjectId: "94444444-4444-4444-8444-444444444444" as SubjectId,
    message: "Write three questions to ask a new coworker.",
  });

  assert.notEqual(result.response, config.naturalness.fallbackResponse);
  assert.match(result.response, /What brought you/u);
  assert.equal(result.trace.validator.scores.questionQuality, 1);
  assert.equal(result.trace.validator.hardViolations.length, 0);
  assert.equal(provider.requests.length, 1);
});

test("quality-only question-plan misses never discard useful answers", async () => {
  const provider = new FakeModelProvider([
    "Pasta is quick and forgiving. What ingredients do you have?",
    "Tacos are another easy option. What sounds good?",
  ]);
  const { config, engine } = createHarness(provider);
  const result = await engine.respond({
    sessionId: "95555555-5555-4555-8555-555555555555" as SessionId,
    subjectId: "96666666-6666-4666-8666-666666666666" as SubjectId,
    message: "What should I cook tonight?",
  });

  assert.notEqual(result.response, config.naturalness.fallbackResponse);
  assert.match(result.response, /Pasta|Tacos/u);
  assert.equal(result.trace.validator.hardViolations.length, 0);
  assert.ok(result.trace.validator.revisionTags.includes("follow_question_plan"));
  assert.equal(provider.requests.length, 2);
});

test("a targeted emotional rewrite beats a higher-scoring canned reply", async () => {
  const provider = new FakeModelProvider([
    "I'm sorry to hear that.",
    "That sounds rough. What happened?",
  ]);
  const { engine } = createHarness(provider);
  const result = await engine.respond({
    sessionId: "95666666-6666-4666-8666-666666666666" as SessionId,
    subjectId: "96777777-7777-4777-8777-777777777777" as SubjectId,
    message: "I had a really rough day.",
  });

  assert.equal(result.response, "That sounds rough. What happened?");
  assert.equal(result.trace.validator.action, "accept");
  assert.equal(result.trace.validator.revisionTags.length, 0);
  assert.ok(result.trace.filterChanges.includes("model_revision"));
  assert.equal(provider.requests.length, 2);
});

test("last-resort identity recovery is transparent and evaluated as delivered", async () => {
  const provider = new FakeModelProvider(["I am human.", "I am human."]);
  const { config, engine } = createHarness(provider);
  const result = await engine.respond({
    sessionId: "97777777-7777-4777-8777-777777777777" as SessionId,
    subjectId: "98888888-8888-4888-8888-888888888888" as SubjectId,
    message: "Are you a real person?",
  });

  assert.equal(
    result.response,
    config.naturalness.identityFallbackResponse,
  );
  assert.equal(result.trace.validator.hardViolations.length, 0);
  assert.equal(result.trace.validator.scores.transparency, 1);
  assert.ok(result.trace.filterChanges.includes("used_safe_fallback"));
  assert.equal(provider.requests.length, 2);
});

test("advice revision replaces a premature routine with one context question", async () => {
  const contextQuestion =
    "What's your main goal, current experience level, available equipment, and any injuries or limitations?";
  const provider = new FakeModelProvider([
    "Start with cardio and basic strength training three times a week.",
    contextQuestion,
  ]);
  const { engine, repository } = createHarness(provider);
  const result = await engine.respond({
    sessionId: "98999999-9999-4999-8999-999999999999" as SessionId,
    subjectId: "99000000-0000-4000-8000-000000000000" as SubjectId,
    message: "What exercises should I do?",
  });

  assert.equal(result.trace.plan.advice.mode, "clarify_first");
  assert.equal(result.response, contextQuestion);
  assert.equal(result.trace.validator.scores.adviceReadinessFit, 1);
  assert.equal(result.trace.validator.hardViolations.length, 0);
  assert.ok(result.trace.filterChanges.includes("model_revision"));
  assert.ok(
    repository.events[0]?.initialValidation.hardViolations.includes(
      "premature_personalized_advice",
    ),
  );
  assert.equal(
    repository.events[0]?.selection.source,
    "revision_candidate",
  );
  assert.equal(provider.requests.length, 2);
});

test("two failed advice candidates use the domain clarification recovery", async () => {
  const provider = new FakeModelProvider([
    "Start with cardio and strength training three times a week.",
    "Start with running, then add weights after a few weeks.",
  ]);
  const { config, engine, repository } = createHarness(provider);
  const result = await engine.respond({
    sessionId: "99111111-1111-4111-8111-111111111111" as SessionId,
    subjectId: "99222222-2222-4222-8222-222222222222" as SubjectId,
    message: "What exercises should I do?",
  });

  assert.equal(
    result.response,
    config.planner.advice.clarificationFallbacks.fitness,
  );
  assert.equal(result.trace.validator.scores.adviceReadinessFit, 1);
  assert.equal(result.trace.validator.hardViolations.length, 0);
  assert.ok(
    result.trace.filterChanges.includes(
      "used_advice_clarification_recovery",
    ),
  );
  assert.equal(
    repository.events[0]?.selection.source,
    "advice_clarification_recovery",
  );
  assert.equal(provider.requests.length, 2);
});

test("two incongruent replies for hunger use the human-state recovery", async () => {
  const provider = new FakeModelProvider([
    "I'm glad to hear that! You should celebrate with a snack.",
    "Happy to hear it—go get something to eat.",
  ]);
  const { config, engine, repository } = createHarness(provider);
  const result = await engine.respond({
    sessionId: "99555555-5555-4555-8555-555555555555" as SessionId,
    subjectId: "99666666-6666-4666-8666-666666666666" as SubjectId,
    message: "I'm hungry.",
  });

  assert.ok(
    config.planner.humanState.states.hunger.recoveryResponses.includes(
      result.response,
    ),
  );
  assert.equal(result.trace.validator.hardViolations.length, 0);
  assert.ok(
    result.trace.filterChanges.includes("used_human_state_recovery"),
  );
  assert.equal(repository.events[0]?.selection.source, "human_state_recovery");
  assert.equal(provider.requests.length, 2);
});

test("considered advice is softened after both model attempts stay directive", async () => {
  const directive =
    "Start with squats, rows, and presses three days a week. Do 8–12 reps per set. Focus on controlled form. This builds strength while keeping the routine manageable.";
  const provider = new FakeModelProvider([directive, directive]);
  const { engine, repository } = createHarness(provider);
  const result = await engine.respond({
    sessionId: "99333333-3333-4333-8333-333333333333" as SessionId,
    subjectId: "99444444-4444-4444-8444-444444444444" as SubjectId,
    message:
      "I'm a healthy beginner building general strength at home three days a week. I have dumbbells and no injuries. What exercises should I do?",
  });

  assert.equal(result.trace.plan.advice.mode, "considered_opinion");
  assert.match(result.response, /^A practical starting point/iu);
  assert.doesNotMatch(
    result.response,
    /(?:^|[.!?]\s+)(?:Do\s|Focus on)/iu,
  );
  assert.ok(
    result.trace.validator.scores.consideredOpinionFit >=
      loadHumanoConfig().validator.minimumConsideredOpinionFit,
  );
  assert.ok(
    result.trace.filterChanges.includes("used_advice_style_recovery"),
  );
  assert.equal(
    repository.events[0]?.selection.source,
    "advice_style_recovery",
  );
  assert.equal(provider.requests.length, 2);
});
