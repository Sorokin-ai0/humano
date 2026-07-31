import assert from "node:assert/strict";
import test from "node:test";
import { loadHumanoConfig } from "../../src/humano/config/load-config";
import type {
  ConversationTurn,
  SessionId,
  TurnId,
} from "../../src/humano/domain/types";
import { AdaptiveConversationalDepthEngine } from "../../src/humano/engines/depth/adaptive-conversational-depth-engine";
import { HeuristicEmotionEngine } from "../../src/humano/engines/emotion/heuristic-emotion-engine";

const config = loadHumanoConfig();
const emotions = new HeuristicEmotionEngine(config.emotion);
const depth = new AdaptiveConversationalDepthEngine(config.planner.depth);

type DepthContext = Parameters<typeof depth.assess>[0]["context"];

async function assess(
  text: string,
  overrides: Partial<DepthContext> = {},
  history: ConversationTurn[] = [],
) {
  return depth.assess({
    text,
    emotions: await emotions.analyze(text),
    history,
    context: {
      socialExchange: false,
      acknowledgement: false,
      identityQuestion: false,
      humorRequest: false,
      materialAmbiguity: false,
      emotionalDisclosure: false,
      celebratoryDisclosure: false,
      directQuestion: text.includes("?"),
      requestedBrief: false,
      requestedDetail: false,
      requestedLong: false,
      ...overrides,
    },
  });
}

test("adaptive depth separates facts from substantive explanations", async () => {
  const [fact, definition, explanation, advice, comparison, troubleshooting] =
    await Promise.all([
      assess("What is the capital of Kazakhstan?"),
      assess("What does confirmation bias mean?"),
      assess(
        "Why does metal feel colder than wood when both are at room temperature?",
      ),
      assess(
        "I keep procrastinating on a 20-minute task. What should I do?",
      ),
      assess(
        "SQLite or Postgres for a small app that may grow to multiple writers?",
      ),
      assess(
        "Wi-Fi says connected, but no sites load on one laptop. What should I check?",
      ),
    ]);

  assert.deepEqual(
    [fact.taskKind, fact.level],
    ["simple_fact", "concise"],
  );
  assert.deepEqual(
    [definition.taskKind, definition.level],
    ["definition", "explained"],
  );
  assert.ok(definition.coverage.includes("definition"));
  assert.ok(definition.coverage.includes("concrete_example"));
  assert.deepEqual(
    [explanation.taskKind, explanation.level],
    ["explanation", "explained"],
  );
  assert.ok(explanation.coverage.includes("mechanism_or_reason"));
  assert.deepEqual(
    [advice.taskKind, advice.level],
    ["recommendation", "explained"],
  );
  assert.ok(advice.coverage.includes("tradeoff"));
  assert.deepEqual(
    [comparison.taskKind, comparison.level],
    ["comparison", "explained"],
  );
  assert.ok(comparison.coverage.includes("tradeoff"));
  assert.deepEqual(
    [troubleshooting.taskKind, troubleshooting.level],
    ["troubleshooting", "explained"],
  );
  assert.ok(troubleshooting.coverage.includes("likely_cause"));
  assert.ok(troubleshooting.coverage.includes("ordered_checks"));
  assert.ok(troubleshooting.coverage.includes("decision_branch"));
});

test("explicit brevity caps presentation without erasing coverage", async () => {
  const concise = await assess("Explain photosynthesis in one sentence.", {
    requestedBrief: true,
  });
  const deep = await assess(
    "Walk me through TLS step by step in detail.",
    { requestedDetail: true },
  );

  assert.equal(concise.level, "concise");
  assert.equal(concise.taskKind, "explanation");
  assert.ok(concise.coverage.includes("mechanism_or_reason"));
  assert.ok(concise.signals.includes("explicit_brevity"));
  assert.equal(deep.level, "deep");
  assert.ok(deep.signals.includes("explicit_detail"));
  assert.ok(deep.coverage.includes("important_caveat"));
});

test("multi-part requests deepen while short follow-ups answer only the delta", async () => {
  const multiPart = await assess(
    "Compare SQLite and Postgres and also explain how I should migrate later.",
  );
  const sessionId =
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as SessionId;
  const history: ConversationTurn[] = [
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as TurnId,
      sessionId,
      ordinal: 1,
      role: "user",
      content:
        "Why does metal feel colder than wood at the same temperature?",
      createdAt: new Date(0).toISOString(),
      estimatedTokens: 12,
    },
    {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as TurnId,
      sessionId,
      ordinal: 2,
      role: "assistant",
      content:
        "Metal draws heat from your hand faster because it conducts heat better.",
      createdAt: new Date(0).toISOString(),
      estimatedTokens: 12,
    },
  ];
  const followUp = await assess("What about plastic?", {}, history);

  assert.equal(multiPart.level, "deep");
  assert.ok(multiPart.signals.includes("multi_part"));
  assert.equal(followUp.taskKind, "explanation");
  assert.equal(followUp.level, "concise");
  assert.ok(followUp.signals.includes("contextual_follow_up"));
});
