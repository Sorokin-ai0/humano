import assert from "node:assert/strict";
import test from "node:test";
import { loadHumanoConfig } from "../../src/humano/config/load-config";
import type {
  ConversationTurn,
  SessionId,
  TurnId,
} from "../../src/humano/domain/types";
import { ConfigurableAdviceReadinessEngine } from "../../src/humano/engines/advice/configurable-advice-readiness-engine";

const config = loadHumanoConfig();
const advice = new ConfigurableAdviceReadinessEngine(config.planner.advice);

type AdviceAssessment = Awaited<ReturnType<typeof advice.assess>>;

function assertAssessmentShape(result: AdviceAssessment) {
  assert.equal(typeof result.detected, "boolean");
  assert.equal(typeof result.domain, "string");
  assert.ok(result.algorithmVersion.length > 0);
  assert.ok(result.confidence >= 0 && result.confidence <= 1);
  assert.ok(Array.isArray(result.missingContext));
  assert.ok(Array.isArray(result.signals));
}

function historyTurn(
  ordinal: number,
  role: ConversationTurn["role"],
  content: string,
): ConversationTurn {
  return {
    id: `00000000-0000-4000-8000-${ordinal.toString().padStart(12, "0")}` as TurnId,
    sessionId:
      "11111111-1111-4111-8111-111111111111" as SessionId,
    ordinal,
    role,
    content,
    createdAt: new Date(ordinal * 1_000).toISOString(),
    estimatedTokens: Math.max(1, Math.ceil(content.length / 4)),
  };
}

test("generic personalized fitness advice asks for the context that changes the answer", async () => {
  const result = await advice.assess({
    text: "What exercises should I do?",
    history: [],
    urgency: 0.02,
  });

  assertAssessmentShape(result);
  assert.equal(result.detected, true);
  assert.equal(result.domain, "fitness");
  assert.equal(result.mode, "clarify_first");
  assert.ok(result.missingContext.length > 0);
  assert.ok(result.questionFocus);
  assert.equal(result.questionFocus?.length, 1);
  assert.equal(result.algorithmVersion, config.planner.advice.algorithmVersion);
});

test("fitness advice becomes a considered opinion once the useful context is supplied", async () => {
  const result = await advice.assess({
    text: "I'm a healthy beginner trying to build general strength at home three days a week. I have adjustable dumbbells, a bench, and no injuries. What exercises should I do?",
    history: [],
    urgency: 0.02,
  });

  assertAssessmentShape(result);
  assert.equal(result.detected, true);
  assert.equal(result.domain, "fitness");
  assert.equal(result.mode, "considered_opinion");
});

test("ordinary low-stakes cooking advice does not over-clarify", async () => {
  const result = await advice.assess({
    text: "What should I cook for dinner?",
    history: [],
    urgency: 0.02,
  });

  assertAssessmentShape(result);
  assert.equal(result.detected, true);
  assert.equal(result.mode, "considered_opinion");
  assert.equal(result.questionFocus, null);
});

test("context supplied after an earlier advice request is enough to answer", async () => {
  const history: ConversationTurn[] = [
    historyTurn(1, "user", "What exercises should I do?"),
    historyTurn(
      2,
      "assistant",
      "What's your main goal with exercise right now?",
    ),
  ];
  const result = await advice.assess({
    text: "I want general strength, I'm a beginner, I can train three days a week, I have dumbbells, and I don't have any injuries.",
    history,
    urgency: 0.02,
  });

  assertAssessmentShape(result);
  assert.equal(result.detected, true);
  assert.equal(result.domain, "fitness");
  assert.equal(result.mode, "considered_opinion");
});

test("urgency favors safe direct guidance over a context-gathering loop", async () => {
  const result = await advice.assess({
    text: "My pan is smoking and I need to act right now. What should I do?",
    history: [],
    urgency: 0.96,
  });

  assertAssessmentShape(result);
  assert.equal(result.detected, true);
  assert.equal(result.mode, "direct_guidance");
  assert.equal(result.questionFocus, null);
});
