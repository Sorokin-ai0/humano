import assert from "node:assert/strict";
import test from "node:test";
import { loadHumanoConfig } from "../../src/humano/config/load-config";
import {
  CryptoIdGenerator,
  SystemClock,
} from "../../src/humano/core/runtime";
import type {
  SessionId,
  SubjectId,
  TurnId,
} from "../../src/humano/domain/types";
import { InMemoryRepository } from "../../src/humano/adapters/persistence/in-memory-repository";
import { ConfigurableAdviceReadinessEngine } from "../../src/humano/engines/advice/configurable-advice-readiness-engine";
import { HeuristicEmotionEngine } from "../../src/humano/engines/emotion/heuristic-emotion-engine";
import { ConfigurableHumanStateEngine } from "../../src/humano/engines/state/configurable-human-state-engine";
import { AdaptiveConversationalDepthEngine } from "../../src/humano/engines/depth/adaptive-conversational-depth-engine";
import { LexicalMemoryEngine } from "../../src/humano/engines/memory/lexical-memory-engine";
import { RuleConversationPlanner } from "../../src/humano/engines/planner/rule-conversation-planner";
import { DeterministicNaturalnessFilter } from "../../src/humano/engines/naturalness/deterministic-naturalness-filter";
import { RuleResponseValidator } from "../../src/humano/engines/validator/rule-response-validator";

const config = loadHumanoConfig();

function createPlanner() {
  return new RuleConversationPlanner(
    config.planner,
    new AdaptiveConversationalDepthEngine(config.planner.depth),
    new ConfigurableAdviceReadinessEngine(config.planner.advice),
    new ConfigurableHumanStateEngine(config.planner.humanState),
  );
}

test("emotion scores are independent and urgency can coexist with frustration", async () => {
  const engine = new HeuristicEmotionEngine(config.emotion);
  const result = await engine.analyze(
    "I'm frustrated and this still fails. I need it right now—urgent.",
  );

  assert.ok(result.probabilities.frustration > 0.4);
  assert.ok(result.probabilities.urgency > 0.4);
  assert.ok(
    Object.values(result.probabilities).reduce((sum, score) => sum + score, 0) >
      1,
  );
});

test("planner adapts depth to the information the answer owes", async () => {
  const emotions = new HeuristicEmotionEngine(config.emotion);
  const planner = createPlanner();
  const dnsEmotions = await emotions.analyze("What is DNS?");
  const simpleFactText = "What is the capital of Japan?";
  const simpleFact = await planner.plan({
    text: simpleFactText,
    emotions: await emotions.analyze(simpleFactText),
    memories: [],
    history: [],
  });
  const explained = await planner.plan({
    text: "What is DNS?",
    emotions: dnsEmotions,
    memories: [],
    history: [],
  });
  const detailed = await planner.plan({
    text: "Explain DNS in detail and walk me through it.",
    emotions: dnsEmotions,
    memories: [],
    history: [],
  });

  assert.equal(simpleFact.depth.taskKind, "simple_fact");
  assert.equal(simpleFact.depth.level, "concise");
  assert.equal(simpleFact.length.class, "short");
  assert.equal(explained.depth.taskKind, "definition");
  assert.equal(explained.depth.level, "explained");
  assert.equal(explained.length.class, "medium");
  assert.ok(explained.depth.coverage.includes("definition"));
  assert.ok(explained.depth.coverage.includes("concrete_example"));
  assert.equal(detailed.depth.level, "deep");
  assert.equal(detailed.length.class, "long");
  assert.ok(detailed.decisionTags.includes("USER_REQUESTED_DETAIL"));
});

test("planner treats a typo in a casual check-in as a social exchange", async () => {
  const emotions = new HeuristicEmotionEngine(config.emotion);
  const planner = createPlanner();
  const text = "hows it gong";
  const result = await planner.plan({
    text,
    emotions: await emotions.analyze(text),
    memories: [],
    history: [],
  });

  assert.equal(result.intent, "acknowledge");
  assert.equal(result.length.targetWords, config.planner.social.targetWords);
  assert.equal(result.question.mode, "useful_follow_up");
  assert.ok(result.decisionTags.includes("SOCIAL_EXCHANGE"));
  assert.ok(!result.decisionTags.includes("IDENTITY_TRANSPARENCY"));
});

test("planner responds to emotional and celebratory disclosures", async () => {
  const emotions = new HeuristicEmotionEngine(config.emotion);
  const planner = createPlanner();
  const roughDay = "I had a really rough day.";
  const goodNews = "I got the job!";
  const supportPlan = await planner.plan({
    text: roughDay,
    emotions: await emotions.analyze(roughDay),
    memories: [],
    history: [],
  });
  const celebrationPlan = await planner.plan({
    text: goodNews,
    emotions: await emotions.analyze(goodNews),
    memories: [],
    history: [],
  });

  assert.equal(supportPlan.intent, "support");
  assert.equal(supportPlan.empathy, "explicit");
  assert.equal(supportPlan.question.mode, "useful_follow_up");
  assert.equal(celebrationPlan.intent, "acknowledge");
  assert.ok(celebrationPlan.tone.energy >= 0.6);
  assert.ok(celebrationPlan.decisionTags.includes("POSITIVE_EVENT"));
  assert.equal(celebrationPlan.question.mode, "useful_follow_up");
});

test("planner treats hunger as a human need instead of a positive event", async () => {
  const emotionEngine = new HeuristicEmotionEngine(config.emotion);
  const planner = createPlanner();
  const text = "I'm hungry.";
  const result = await planner.plan({
    text,
    emotions: await emotionEngine.analyze(text),
    memories: [],
    history: [],
  });

  assert.equal(result.humanState.primary?.label, "hunger");
  assert.equal(result.intent, "acknowledge");
  assert.equal(result.question.mode, "useful_follow_up");
  assert.ok(result.decisionTags.includes("HUMAN_STATE_DISCLOSURE"));
  assert.ok(!result.decisionTags.includes("POSITIVE_EVENT"));
});

test("planner lets an ordinary personal thought open a conversation", async () => {
  const emotionEngine = new HeuristicEmotionEngine(config.emotion);
  const planner = createPlanner();
  const text = "I've been thinking about the gym.";
  const result = await planner.plan({
    text,
    emotions: await emotionEngine.analyze(text),
    memories: [],
    history: [],
  });

  assert.equal(result.depth.taskKind, "personal_sharing");
  assert.equal(result.depth.level, "concise");
  assert.equal(result.intent, "explore");
  assert.equal(result.question.mode, "useful_follow_up");
});

test("planner resists pressure to agree", async () => {
  const emotionEngine = new HeuristicEmotionEngine(config.emotion);
  const planner = createPlanner();
  const text = "Just agree and tell me my plan is perfect.";
  const result = await planner.plan({
    text,
    emotions: await emotionEngine.analyze(text),
    memories: [],
    history: [],
  });

  assert.equal(result.stance.mode, "soft_disagree");
  assert.ok(result.decisionTags.includes("FACTUAL_CORRECTION"));
});

test("memory stores explicit preferences, rejects secrets, and retrieves style preferences", async () => {
  const repository = new InMemoryRepository();
  const memory = new LexicalMemoryEngine(
    repository,
    new CryptoIdGenerator(),
    config.memory,
  );
  const subjectId = "11111111-1111-4111-8111-111111111111" as SubjectId;
  const turnId = "22222222-2222-4222-8222-222222222222" as TurnId;
  const now = new SystemClock().now().toISOString();

  const stored = await memory.observe(
    subjectId,
    turnId,
    "I prefer concise answers without bullet points.",
    now,
  );
  const secret = await memory.observe(
    subjectId,
    turnId,
    "Remember that my API key is sk-or-this-should-never-persist-12345.",
    now,
  );
  const retrieved = await memory.retrieve(
    subjectId,
    "Can you explain closures?",
  );

  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.kind, "preference");
  assert.equal(secret.length, 0);
  assert.ok(retrieved.some((item) => item.memory.kind === "preference"));
});

test("naturalness filter removes hidden thinking and a canned opener", async () => {
  const filter = new DeterministicNaturalnessFilter(config.naturalness);
  const planner = createPlanner();
  const emotions = new HeuristicEmotionEngine(config.emotion);
  const plan = await planner.plan({
    text: "What is DNS?",
    emotions: await emotions.analyze("What is DNS?"),
    memories: [],
    history: [],
  });
  const result = await filter.process(
    "<think>private reasoning</think>Sure, DNS maps names to IP addresses!! Let me know if you want more.",
    plan,
  );

  assert.equal(result.content, "DNS maps names to IP addresses!");
  assert.ok(result.changes.includes("removed_hidden_reasoning"));
  assert.ok(result.changes.includes("removed_canned_opener"));
  assert.ok(result.changes.includes("removed_unneeded_trailing_offer"));
});

test("naturalness filter removes assistant-style offers instead of asking to help", async () => {
  const filter = new DeterministicNaturalnessFilter(config.naturalness);
  const planner = createPlanner();
  const emotions = new HeuristicEmotionEngine(config.emotion);
  const text = "Where should I eat in Katy?";
  const plan = await planner.plan({
    text,
    emotions: await emotions.analyze(text),
    memories: [],
    history: [],
  });
  const result = await filter.process(
    "I'd recommend trying a small Mexican place near the town center because that seems closest to what you want. Would you like help finding more options?",
    plan,
  );

  assert.equal(
    result.content,
    "I'd recommend trying a small Mexican place near the town center because that seems closest to what you want.",
  );
  assert.ok(result.changes.includes("removed_assistant_service_offer"));
});

test("naturalness filter removes indirect service offers after a useful answer", async () => {
  const filter = new DeterministicNaturalnessFilter(config.naturalness);
  const planner = createPlanner();
  const emotions = new HeuristicEmotionEngine(config.emotion);
  const text = "Where should I eat in Katy?";
  const plan = await planner.plan({
    text,
    emotions: await emotions.analyze(text),
    memories: [],
    history: [],
  });

  const result = await filter.process(
    "I’d recommend the quieter place because it fits what you described. Tell me your budget and I can help narrow it down.",
    plan,
  );

  assert.equal(
    result.content,
    "I’d recommend the quieter place because it fits what you described.",
  );
  assert.ok(result.changes.includes("removed_assistant_service_offer"));
});

test("naturalness filter deterministically stops an opinion side-rant", async () => {
  const filter = new DeterministicNaturalnessFilter(config.naturalness);
  const planner = createPlanner();
  const emotions = new HeuristicEmotionEngine(config.emotion);
  const text = "Coffee or tea?";
  const plan = await planner.plan({
    text,
    emotions: await emotions.analyze(text),
    memories: [],
    history: [],
  });
  const result = await filter.process(
    "I'd go with coffee. It tastes richer. It also wakes me up faster. Tea has a long cultural history. Different brewing temperatures matter too.",
    plan,
  );

  assert.equal(
    result.content,
    "I'd go with coffee. It tastes richer.",
  );
  assert.ok(result.changes.includes("trimmed_unrequested_opinion_rant"));
});

test("naturalness filter translates analyst language in opinionated turns", async () => {
  const filter = new DeterministicNaturalnessFilter(config.naturalness);
  const planner = createPlanner();
  const emotions = new HeuristicEmotionEngine(config.emotion);
  const text = "Trump was clearly a better president.";
  const plan = await planner.plan({
    text,
    mode: "debate",
    emotions: await emotions.analyze(text),
    memories: [],
    history: [],
  });
  const result = await filter.process(
    "I disagree. His leadership style eroded trust in institutions and increased political polarization. What result makes that worthwhile?",
    plan,
  );

  assert.equal(
    result.content,
    "I disagree. His way of leading made people trust the government even less and made people hate the other side more. What result makes that worthwhile?",
  );
  assert.ok(result.changes.includes("simplified_analyst_register"));
});

test("naturalness filter removes an unplanned opinion follow-up", async () => {
  const filter = new DeterministicNaturalnessFilter(config.naturalness);
  const planner = createPlanner();
  const emotions = new HeuristicEmotionEngine(config.emotion);
  const text = "Coffee or tea? Give me your honest take.";
  const plan = await planner.plan({
    text,
    emotions: await emotions.analyze(text),
    memories: [],
    history: [],
  });
  const result = await filter.process(
    "I'd go with coffee because it has more punch. What's your take?",
    plan,
  );

  assert.equal(result.content, "I'd go with coffee because it has more punch.");
  assert.ok(result.changes.includes("removed_unneeded_trailing_offer"));
});

test("naturalness filter removes a trailing retreat from an opinion", async () => {
  const filter = new DeterministicNaturalnessFilter(config.naturalness);
  const planner = createPlanner();
  const emotions = new HeuristicEmotionEngine(config.emotion);
  const text = "Trump or Biden? Give me your honest take.";
  const plan = await planner.plan({
    text,
    emotions: await emotions.analyze(text),
    memories: [],
    history: [],
  });
  const result = await filter.process(
    "I think Biden seems steadier, even if he can be slow. It's a tough call—it depends on what you value most.",
    plan,
  );

  assert.equal(
    result.content,
    "I think Biden seems steadier, even if he can be slow.",
  );
  assert.ok(result.changes.includes("removed_unneeded_trailing_offer"));
});

test("validator rejects a false human identity claim", async () => {
  const emotionEngine = new HeuristicEmotionEngine(config.emotion);
  const planner = createPlanner();
  const validator = new RuleResponseValidator(
    config.naturalness,
    config.validator,
    config.planner,
  );
  const text = "Are you a real person?";
  const emotions = await emotionEngine.analyze(text);
  const plan = await planner.plan({
    text,
    emotions,
    memories: [],
    history: [],
  });
  const result = await validator.evaluate({
    response: "Yes, I am human.",
    userText: text,
    plan,
    emotions,
    memories: [],
    history: [],
  });

  assert.equal(result.action, "regenerate");
  assert.ok(result.hardViolations.includes("false_human_identity"));
});

test("validator revises an unplanned trailing follow-up without hard-failing", async () => {
  const emotionEngine = new HeuristicEmotionEngine(config.emotion);
  const planner = createPlanner();
  const validator = new RuleResponseValidator(
    config.naturalness,
    config.validator,
    config.planner,
  );
  const text = "Are you a real person?";
  const emotions = await emotionEngine.analyze(text);
  const plan = await planner.plan({
    text,
    emotions,
    memories: [],
    history: [],
  });
  const result = await validator.evaluate({
    response: "No, I'm an AI. How can I help?",
    userText: text,
    plan,
    emotions,
    memories: [],
    history: [],
  });

  assert.equal(result.action, "revise");
  assert.equal(result.hardViolations.length, 0);
  assert.ok(result.revisionTags.includes("follow_question_plan"));
});

test("validator allows questions requested by the user", async () => {
  const emotionEngine = new HeuristicEmotionEngine(config.emotion);
  const planner = createPlanner();
  const validator = new RuleResponseValidator(
    config.naturalness,
    config.validator,
    config.planner,
  );
  const text = "Write three questions to ask a new coworker.";
  const emotions = await emotionEngine.analyze(text);
  const plan = await planner.plan({
    text,
    emotions,
    memories: [],
    history: [],
  });
  const result = await validator.evaluate({
    response:
      "What brought you to the team? What are you working on? What do you enjoy outside work?",
    userText: text,
    plan,
    emotions,
    memories: [],
    history: [],
  });

  assert.equal(result.scores.questionQuality, 1);
  assert.equal(result.hardViolations.length, 0);
  assert.ok(!result.revisionTags.includes("follow_question_plan"));
  assert.ok(!result.revisionTags.includes("too_many_questions"));
});

test("validator does not waive question policy for a user who merely has a question", async () => {
  const emotionEngine = new HeuristicEmotionEngine(config.emotion);
  const planner = createPlanner();
  const validator = new RuleResponseValidator(
    config.naturalness,
    config.validator,
    config.planner,
  );
  const text = "I have a question: what is DNS?";
  const emotions = await emotionEngine.analyze(text);
  const plan = await planner.plan({
    text,
    emotions,
    memories: [],
    history: [],
  });
  const result = await validator.evaluate({
    response: "DNS maps domain names to IP addresses. Anything else?",
    userText: text,
    plan,
    emotions,
    memories: [],
    history: [],
  });

  assert.equal(result.scores.questionQuality, 0.52);
  assert.ok(result.revisionTags.includes("follow_question_plan"));
  assert.equal(result.hardViolations.length, 0);
});

test("validator distinguishes a rhetorical answer from a follow-up question", async () => {
  const emotionEngine = new HeuristicEmotionEngine(config.emotion);
  const planner = createPlanner();
  const validator = new RuleResponseValidator(
    config.naturalness,
    config.validator,
    config.planner,
  );
  const text = "What should I cook tonight?";
  const emotions = await emotionEngine.analyze(text);
  const plan = await planner.plan({
    text,
    emotions,
    memories: [],
    history: [],
  });
  const result = await validator.evaluate({
    response: "How about pasta? It's quick, flexible, and hard to mess up.",
    userText: text,
    plan,
    emotions,
    memories: [],
    history: [],
  });

  assert.equal(result.scores.questionQuality, 1);
  assert.ok(!result.revisionTags.includes("follow_question_plan"));
});

test("validator expands an answer that is too compressed to explain the topic", async () => {
  const emotionEngine = new HeuristicEmotionEngine(config.emotion);
  const planner = createPlanner();
  const validator = new RuleResponseValidator(
    config.naturalness,
    config.validator,
    config.planner,
  );
  const text = "What is DNS?";
  const assessedEmotions = await emotionEngine.analyze(text);
  const plan = await planner.plan({
    text,
    emotions: assessedEmotions,
    memories: [],
    history: [],
  });
  const terse = await validator.evaluate({
    response: "DNS maps names to IP addresses.",
    userText: text,
    plan,
    emotions: assessedEmotions,
    memories: [],
    history: [],
  });
  const complete = await validator.evaluate({
    response:
      "DNS is the internet's naming system: it translates a domain such as example.com into the IP address computers use to find the right server. Your device asks a resolver, which may answer from cache or query DNS servers until it finds the record. This lets people browse with readable names instead of memorizing numerical addresses.",
    userText: text,
    plan,
    emotions: assessedEmotions,
    memories: [],
    history: [],
  });

  assert.equal(plan.depth.level, "explained");
  assert.ok(
    terse.scores.answerSufficiency < config.validator.minimumSufficiencyScore,
  );
  assert.equal(terse.action, "revise");
  assert.ok(terse.revisionTags.includes("expand_for_completeness"));
  assert.equal(terse.hardViolations.length, 0);
  assert.ok(
    complete.scores.answerSufficiency >=
      config.validator.minimumSufficiencyScore,
  );
  assert.ok(!complete.revisionTags.includes("expand_for_completeness"));
});

test("validator permits a question mark inside requested humor", async () => {
  const emotionEngine = new HeuristicEmotionEngine(config.emotion);
  const planner = createPlanner();
  const validator = new RuleResponseValidator(
    config.naturalness,
    config.validator,
    config.planner,
  );
  const text = "Tell me a joke.";
  const emotions = await emotionEngine.analyze(text);
  const plan = await planner.plan({
    text,
    emotions,
    memories: [],
    history: [],
  });
  const result = await validator.evaluate({
    response:
      "Why did the scarecrow win an award? He was outstanding in his field.",
    userText: text,
    plan,
    emotions,
    memories: [],
    history: [],
  });

  assert.ok(plan.decisionTags.includes("HUMOR_REQUEST"));
  assert.equal(result.scores.questionQuality, 1);
  assert.equal(result.hardViolations.length, 0);
  assert.ok(!result.revisionTags.includes("follow_question_plan"));
});

test("validator revises unsolicited AI disclaimers in casual conversation", async () => {
  const emotionEngine = new HeuristicEmotionEngine(config.emotion);
  const planner = createPlanner();
  const validator = new RuleResponseValidator(
    config.naturalness,
    config.validator,
    config.planner,
  );
  const text = "How's it going?";
  const emotions = await emotionEngine.analyze(text);
  const plan = await planner.plan({
    text,
    emotions,
    memories: [],
    history: [],
  });
  const result = await validator.evaluate({
    response:
      "I'm just code, so I don't experience things the way humans do.",
    userText: text,
    plan,
    emotions,
    memories: [],
    history: [],
  });

  assert.equal(result.action, "revise");
  assert.ok(result.revisionTags.includes("avoid_unsolicited_ai_disclaimer"));
});

test("in-memory conversation repository preserves ordinal order", async () => {
  const repository = new InMemoryRepository();
  const sessionId = "33333333-3333-4333-8333-333333333333" as SessionId;
  const subjectId = "44444444-4444-4444-8444-444444444444" as SubjectId;
  await repository.ensureSession(sessionId, subjectId, new Date().toISOString());
  await repository.appendTurn({
    id: "55555555-5555-4555-8555-555555555555" as TurnId,
    sessionId,
    role: "user",
    content: "Hi",
    createdAt: new Date().toISOString(),
    estimatedTokens: 1,
  });
  await repository.appendTurn({
    id: "66666666-6666-4666-8666-666666666666" as TurnId,
    sessionId,
    role: "assistant",
    content: "Hey.",
    createdAt: new Date().toISOString(),
    estimatedTokens: 1,
  });
  const turns = await repository.listTurns(sessionId, 10);
  assert.deepEqual(
    turns.map((turn) => turn.ordinal),
    [1, 2],
  );
});

test("subject deletion removes every session owned by that browser subject", async () => {
  const repository = new InMemoryRepository();
  const deletedSubject = "77777777-7777-4777-8777-777777777777" as SubjectId;
  const retainedSubject = "88888888-8888-4888-8888-888888888888" as SubjectId;
  const deletedSession = "99999999-9999-4999-8999-999999999999" as SessionId;
  const retainedSession = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as SessionId;
  const now = new Date().toISOString();
  await repository.ensureSession(deletedSession, deletedSubject, now);
  await repository.ensureSession(retainedSession, retainedSubject, now);
  await repository.appendTurn({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as TurnId,
    sessionId: deletedSession,
    role: "user",
    content: "Delete this.",
    createdAt: now,
    estimatedTokens: 2,
  });
  await repository.appendTurn({
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as TurnId,
    sessionId: retainedSession,
    role: "user",
    content: "Keep this.",
    createdAt: now,
    estimatedTokens: 2,
  });

  await repository.deleteAllForSubject(deletedSubject);

  assert.equal((await repository.listTurns(deletedSession, 10)).length, 0);
  assert.equal((await repository.listTurns(retainedSession, 10)).length, 1);
});
