import assert from "node:assert/strict";
import test from "node:test";
import { loadHumanoConfig } from "../../src/humano/config/load-config";
import type {
  AdviceReadinessMode,
  ConversationPlan,
} from "../../src/humano/domain/types";
import { DeterministicAdviceStyleFilter } from "../../src/humano/engines/advice/deterministic-advice-style-filter";

const config = loadHumanoConfig();

function planWithAdviceMode(mode: AdviceReadinessMode): ConversationPlan {
  return {
    advice: { mode },
  } as ConversationPlan;
}

function recommendationPlan(): ConversationPlan {
  return {
    advice: { mode: "considered_opinion", domain: "general" },
    depth: { taskKind: "recommendation" },
  } as ConversationPlan;
}

test("advice style filter is a no-op outside considered opinions", async () => {
  const filter = new DeterministicAdviceStyleFilter(config.adviceStyle);
  const content = "Start with two sessions. You should increase slowly.";

  for (const mode of [
    "not_advice",
    "clarify_first",
    "direct_guidance",
  ] as const) {
    const result = await filter.process(content, planWithAdviceMode(mode));
    assert.equal(result.content, content);
    assert.deepEqual(result.changes, []);
  }
});

test("advice style filter softens configured sentence-initial directives", async () => {
  const filter = new DeterministicAdviceStyleFilter(config.adviceStyle);
  const content =
    "Start with two sessions per week. Focus on compound lifts. " +
    "Aim for 8–12 reps. Use a weight you can control. " +
    "Try adding weight slowly. Make sure you rest between sessions. " +
    "Make sure to stop if pain spikes. Make sure that recovery stays manageable. " +
    "You should increase gradually. You need to leave a rest day. " +
    "Do 8–12 reps per set. Do mobility work on rest days. " +
    "Add a pulling movement. Progress by adding one rep. Keep the plan simple.";

  const result = await filter.process(
    content,
    planWithAdviceMode("considered_opinion"),
  );

  assert.equal(
    result.content,
    "A practical starting point would be two sessions per week. " +
      "I'd keep the focus on compound lifts. " +
      "A reasonable target would be 8–12 reps. I'd use a weight you can control. " +
      "I'd try adding weight slowly. One important consideration is that you rest between sessions. " +
      "One important consideration is to stop if pain spikes. " +
      "One important consideration is that recovery stays manageable. " +
      "A sensible approach would be to increase gradually. " +
      "I'd treat it as important to leave a rest day. " +
      "A reasonable starting range would be 8–12 reps per set. " +
      "A reasonable approach would be to do mobility work on rest days. " +
      "It would also make sense to add a pulling movement. " +
      "Progression could come from adding one rep. " +
      "It would make sense to keep the plan simple.",
  );
  assert.deepEqual(result.changes, [
    "softened_start_with",
    "softened_do_range",
    "softened_do",
    "softened_add",
    "softened_progress",
    "softened_keep",
    "softened_focus_on",
    "softened_aim_for",
    "softened_use",
    "softened_try",
    "softened_make_sure",
    "softened_you_should",
    "softened_you_need_to",
  ]);
});

test("advice style filter preserves fenced code and non-initial wording", async () => {
  const filter = new DeterministicAdviceStyleFilter(config.adviceStyle);
  const content = [
    "The phrase Start with is quoted here.",
    "```text",
    "Start with the primary key.",
    "You should keep this exact example.",
    "```",
    "- Start with one easy session.",
  ].join("\n");

  const result = await filter.process(
    content,
    planWithAdviceMode("considered_opinion"),
  );

  assert.equal(
    result.content,
    [
      "The phrase Start with is quoted here.",
      "```text",
      "Start with the primary key.",
      "You should keep this exact example.",
      "```",
      "- A practical starting point would be one easy session.",
    ].join("\n"),
  );
  assert.deepEqual(result.changes, ["softened_start_with"]);
});

test("advice style filter keeps a recommendation conversational instead of directory-like", async () => {
  const filter = new DeterministicAdviceStyleFilter(config.adviceStyle);
  const result = await filter.process(
    "I'd lean toward Cafe One because it's relaxed. If you want something fancier, try Bistro Two. For pastries, look at Bakery Three. There's also Diner Four.",
    recommendationPlan(),
  );

  assert.equal(
    result.content,
    "I'd lean toward Cafe One because it's relaxed. If you want something fancier, try Bistro Two.",
  );
  assert.ok(result.changes.includes("trimmed_recommendation_directory"));
});

test("advice style rules and change tags are supplied entirely by config", async () => {
  const filter = new DeterministicAdviceStyleFilter({
    algorithmVersion: "test-advice-style-1.0",
    enabled: true,
    recommendation: {
      enabled: false,
      maxSentences: 2,
      changeTag: "trimmed_recommendation_directory",
    },
    rules: [
      {
        id: "custom_consider",
        pattern: "^Consider\\s+(.+)$",
        flags: "giu",
        replacement: "One option is $1",
        changeTag: "softened_custom_consider",
      },
    ],
  });

  const result = await filter.process(
    "Consider walking.",
    planWithAdviceMode("considered_opinion"),
  );

  assert.equal(result.content, "One option is walking.");
  assert.deepEqual(result.changes, ["softened_custom_consider"]);
});
