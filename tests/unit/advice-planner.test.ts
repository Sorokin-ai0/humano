import assert from "node:assert/strict";
import test from "node:test";
import { loadHumanoConfig } from "../../src/humano/config/load-config";
import type {
  ConversationTurn,
  EmotionAssessment,
  SessionId,
  TurnId,
} from "../../src/humano/domain/types";
import { ConfigurableAdviceReadinessEngine } from "../../src/humano/engines/advice/configurable-advice-readiness-engine";
import { AdaptiveConversationalDepthEngine } from "../../src/humano/engines/depth/adaptive-conversational-depth-engine";
import { HeuristicEmotionEngine } from "../../src/humano/engines/emotion/heuristic-emotion-engine";
import { ConfigurableHumanStateEngine } from "../../src/humano/engines/state/configurable-human-state-engine";
import { RuleConversationPlanner } from "../../src/humano/engines/planner/rule-conversation-planner";

const config = loadHumanoConfig();
const emotionEngine = new HeuristicEmotionEngine(config.emotion);
const planner = new RuleConversationPlanner(
  config.planner,
  new AdaptiveConversationalDepthEngine(config.planner.depth),
  new ConfigurableAdviceReadinessEngine(config.planner.advice),
  new ConfigurableHumanStateEngine(config.planner.humanState),
);

function historyTurn(
  ordinal: number,
  role: ConversationTurn["role"],
  content: string,
): ConversationTurn {
  return {
    id: `22222222-2222-4222-8222-${ordinal.toString().padStart(12, "0")}` as TurnId,
    sessionId:
      "33333333-3333-4333-8333-333333333333" as SessionId,
    ordinal,
    role,
    content,
    createdAt: new Date(ordinal * 1_000).toISOString(),
    estimatedTokens: Math.max(1, Math.ceil(content.length / 4)),
  };
}

async function plan(
  text: string,
  history: ConversationTurn[] = [],
  urgency?: number,
) {
  const detected = await emotionEngine.analyze(text);
  const emotions: EmotionAssessment =
    urgency === undefined
      ? detected
      : {
          ...detected,
          probabilities: {
            ...detected.probabilities,
            urgency,
          },
        };

  return planner.plan({
    text,
    emotions,
    memories: [],
    history,
  });
}

test("planner turns generic personalized fitness advice into one focused clarification", async () => {
  const result = await plan("What exercises should I do?");

  assert.equal(result.advice.detected, true);
  assert.equal(result.advice.domain, "fitness");
  assert.equal(result.advice.mode, "clarify_first");
  assert.equal(result.intent, "clarify");
  assert.equal(result.answerFirst, false);
  assert.equal(result.question.mode, "required_clarification");
  assert.ok(result.question.purpose);
  assert.equal(result.advice.questionFocus?.length, 1);
  assert.match(result.question.purpose ?? "", /one thing/iu);
});

test("planner answers contextual and low-stakes advice without an interrogation", async () => {
  const [fitness, cooking] = await Promise.all([
    plan(
      "I'm a beginner building general strength at home three days a week. I have dumbbells and no injuries. What exercises should I do?",
    ),
    plan("What should I cook for dinner?"),
  ]);

  assert.equal(fitness.advice.mode, "considered_opinion");
  assert.equal(fitness.intent, "answer");
  assert.equal(fitness.answerFirst, true);
  assert.equal(fitness.question.mode, "none");
  assert.equal(cooking.advice.mode, "considered_opinion");
  assert.equal(cooking.intent, "answer");
  assert.equal(cooking.answerFirst, true);
  assert.equal(cooking.question.mode, "none");
});

test("planner treats a local restaurant request as a direct conversational recommendation", async () => {
  const result = await plan("What are good places to eat in Katy, Texas?");

  assert.equal(result.depth.taskKind, "recommendation");
  assert.equal(result.advice.mode, "considered_opinion");
  assert.equal(result.advice.domain, "general");
  assert.equal(result.answerFirst, true);
  assert.equal(result.question.mode, "none");
  assert.equal(result.format, "plain_prose");
});

test("planner treats a short either-or question as a request for considered judgment", async () => {
  const result = await plan("Trump or Biden?");

  assert.equal(result.stance.mode, "considered_opinion");
  assert.ok(result.decisionTags.includes("USER_REQUESTED_OPINION"));
  assert.ok(result.decisionTags.includes("CHOICE_REQUEST"));
  assert.equal(result.answerFirst, true);
  assert.equal(result.question.mode, "none");
});

test("planner recognizes an explicit request for a non-neutral judgment", async () => {
  const result = await plan(
    "Trump or Biden? Give your best considered judgment, not a neutral comparison.",
  );

  assert.equal(result.stance.mode, "considered_opinion");
  assert.ok(result.decisionTags.includes("USER_REQUESTED_OPINION"));
});

test("planner recognizes ordinary conversational opinion wording", async () => {
  const [honestTake, doYouThink] = await Promise.all([
    plan("Coffee or tea? Give me your honest take."),
    plan("Do you think movies are getting worse lately?"),
  ]);

  for (const result of [honestTake, doYouThink]) {
    assert.equal(result.stance.mode, "considered_opinion");
    assert.equal(result.length.targetWords, config.planner.opinion.targetWords);
    assert.equal(result.question.mode, "none");
  }
});

test("opinion depth stays conversational even after a long formal history", async () => {
  const history = Array.from({ length: 8 }, (_, index) =>
    historyTurn(
      index + 1,
      index % 2 === 0 ? "user" : "assistant",
      index % 2 === 0
        ? "What do you think?"
        : "From a governance perspective, the broader implications require a comprehensive policy analysis.",
    ),
  );
  const result = await plan("Trump or Biden?", history);

  assert.equal(result.length.class, "short");
  assert.equal(result.length.targetWords, config.planner.opinion.targetWords);
  assert.equal(result.length.maxSentences, 2);
  assert.equal(result.stance.mode, "considered_opinion");
});

test("debate mode is forceful for claims but yields to ordinary social turns", async () => {
  const emotions = await emotionEngine.analyze(
    "Centralized systems always make better decisions.",
  );
  const debate = await planner.plan({
    text: "Centralized systems always make better decisions.",
    mode: "debate",
    emotions,
    memories: [],
    history: [],
  });
  const socialText = "How are you?";
  const social = await planner.plan({
    text: socialText,
    mode: "debate",
    emotions: await emotionEngine.analyze(socialText),
    memories: [],
    history: [],
  });

  assert.equal(debate.mode, "debate");
  assert.equal(debate.stance.mode, "adversarial_debate");
  assert.equal(debate.length.targetWords, config.planner.debate.targetWords);
  assert.equal(debate.question.mode, "useful_follow_up");
  assert.ok(debate.decisionTags.includes("DEBATE_MODE"));
  assert.equal(social.mode, "standard");
  assert.ok(social.decisionTags.includes("SOCIAL_EXCHANGE"));
});

test("debate mode advocates one side of a forced choice", async () => {
  const text = "Trump or Biden?";
  const result = await planner.plan({
    text,
    mode: "debate",
    emotions: await emotionEngine.analyze(text),
    memories: [],
    history: [],
  });

  assert.equal(result.mode, "debate");
  assert.equal(result.stance.mode, "advocacy_debate");
  assert.ok(result.decisionTags.includes("CHOICE_REQUEST"));
  assert.ok(result.decisionTags.includes("DEBATE_MODE"));
  assert.equal(result.length.targetWords, 62);
  assert.equal(result.question.mode, "useful_follow_up");
});

test("planner carries an earlier advice request into the user's context reply", async () => {
  const history = [
    historyTurn(1, "user", "What exercises should I do?"),
    historyTurn(
      2,
      "assistant",
      "What's your main goal with exercise right now?",
    ),
  ];
  const result = await plan(
    "I want general strength, I'm a beginner, I can train three days a week, I have dumbbells, and I don't have any injuries.",
    history,
  );

  assert.equal(result.advice.detected, true);
  assert.equal(result.advice.domain, "fitness");
  assert.equal(result.advice.mode, "considered_opinion");
  assert.equal(result.intent, "answer");
  assert.equal(result.answerFirst, true);
  assert.equal(result.question.mode, "none");
});

test("planner gives direct guidance when the advice is urgent", async () => {
  const result = await plan(
    "My pan is smoking and I need to act right now. What should I do?",
    [],
    0.96,
  );

  assert.equal(result.advice.mode, "direct_guidance");
  assert.equal(result.intent, "answer");
  assert.equal(result.answerFirst, true);
  assert.equal(result.question.mode, "none");
  assert.ok(result.decisionTags.includes("URGENT"));
});
