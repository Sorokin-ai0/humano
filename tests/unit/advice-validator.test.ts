import assert from "node:assert/strict";
import test from "node:test";
import { loadHumanoConfig } from "../../src/humano/config/load-config";
import { ConfigurableAdviceReadinessEngine } from "../../src/humano/engines/advice/configurable-advice-readiness-engine";
import { AdaptiveConversationalDepthEngine } from "../../src/humano/engines/depth/adaptive-conversational-depth-engine";
import { HeuristicEmotionEngine } from "../../src/humano/engines/emotion/heuristic-emotion-engine";
import { ConfigurableHumanStateEngine } from "../../src/humano/engines/state/configurable-human-state-engine";
import { RuleConversationPlanner } from "../../src/humano/engines/planner/rule-conversation-planner";
import { RuleResponseValidator } from "../../src/humano/engines/validator/rule-response-validator";

const config = loadHumanoConfig();
const emotions = new HeuristicEmotionEngine(config.emotion);
const planner = new RuleConversationPlanner(
  config.planner,
  new AdaptiveConversationalDepthEngine(config.planner.depth),
  new ConfigurableAdviceReadinessEngine(config.planner.advice),
  new ConfigurableHumanStateEngine(config.planner.humanState),
);
const validator = new RuleResponseValidator(
  config.naturalness,
  config.validator,
  config.planner,
  config.modes.debate,
);

async function evaluate(
  userText: string,
  response: string,
  mode: "standard" | "debate" = "standard",
) {
  const emotion = await emotions.analyze(userText);
  const plan = await planner.plan({
    text: userText,
    mode,
    emotions: emotion,
    memories: [],
    history: [],
  });
  const evaluation = await validator.evaluate({
    response,
    userText,
    plan,
    emotions: emotion,
    memories: [],
    history: [],
  });

  return { plan, evaluation };
}

test("validator rejects premature fitness advice when personal context is missing", async () => {
  const { plan, evaluation } = await evaluate(
    "What exercises should I do?",
    "Start with cardio and basic strength training three times a week.",
  );

  assert.equal(plan.advice.mode, "clarify_first");
  assert.ok(
    evaluation.hardViolations.includes(
      "missing_required_clarification",
    ),
  );
  assert.ok(
    evaluation.hardViolations.includes(
      "premature_personalized_advice",
    ),
  );
  assert.ok(
    evaluation.scores.adviceReadinessFit <
      config.validator.minimumAdviceReadinessFit,
  );
  assert.ok(
    evaluation.revisionTags.includes("ask_before_recommending"),
  );
});

test("validator accepts one focused context question for a clarification-first plan", async () => {
  const { plan, evaluation } = await evaluate(
    "What exercises should I do?",
    "What's your main goal with exercise right now?",
  );

  assert.equal(plan.advice.mode, "clarify_first");
  assert.ok(
    evaluation.scores.adviceReadinessFit >=
      config.validator.minimumAdviceReadinessFit,
  );
  assert.ok(
    !evaluation.hardViolations.includes(
      "missing_required_clarification",
    ),
  );
  assert.ok(
    !evaluation.hardViolations.includes(
      "premature_personalized_advice",
    ),
  );
  assert.ok(
    !evaluation.revisionTags.includes("ask_before_recommending"),
  );
});

test("validator rewards a first clarification instead of an intake questionnaire", async () => {
  const { plan, evaluation } = await evaluate(
    "What exercises should I do?",
    "What are you trying to achieve with your workouts?",
  );

  assert.equal(plan.advice.mode, "clarify_first");
  assert.equal(evaluation.hardViolations.length, 0);
  assert.ok(
    evaluation.scores.adviceReadinessFit >=
      config.validator.minimumAdviceReadinessFit,
  );
  assert.ok(
    !evaluation.revisionTags.includes("ask_before_recommending"),
  );
});

test("validator requests rationale and softer framing for a bare prescription", async () => {
  const { plan, evaluation } = await evaluate(
    "I'm a healthy beginner building general strength at home three days a week. I have adjustable dumbbells, a bench, and no injuries. What exercises should I do?",
    "Start with a mix of squats, presses, and rows three days a week.",
  );

  assert.equal(plan.advice.mode, "considered_opinion");
  assert.ok(
    evaluation.scores.consideredOpinionFit <
      config.validator.minimumConsideredOpinionFit,
  );
  assert.ok(evaluation.revisionTags.includes("add_advice_rationale"));
  assert.ok(
    evaluation.revisionTags.includes("reduce_prescriptive_tone"),
  );
});

test("validator passes calibrated advice with a decisive rationale", async () => {
  const { plan, evaluation } = await evaluate(
    "I'm a healthy beginner building general strength at home three days a week. I have adjustable dumbbells, a bench, and no injuries. What exercises should I do?",
    "I'd lean toward three full-body sessions built around squats, rows, presses, and a hip hinge, because that setup matches your three-day schedule and makes good use of adjustable dumbbells. Keeping the exercise menu small should make progression easier to track; if one movement bothers a joint, swap that pattern instead of forcing it. An alternating A/B routine could spread fatigue without making the week complicated.",
  );

  assert.equal(plan.advice.mode, "considered_opinion");
  assert.ok(
    evaluation.scores.consideredOpinionFit >=
      config.validator.minimumConsideredOpinionFit,
  );
  assert.ok(!evaluation.revisionTags.includes("add_advice_rationale"));
  assert.ok(
    !evaluation.revisionTags.includes("reduce_prescriptive_tone"),
  );
});

test("validator revises an information dump when the user asked for an opinion", async () => {
  const { plan, evaluation } = await evaluate(
    "Trump or Biden?",
    "They have different records, policies, and supporters. The choice depends on the issues that matter most to you.",
  );

  assert.equal(plan.stance.mode, "considered_opinion");
  assert.ok(evaluation.revisionTags.includes("give_direct_opinion"));
});

test("validator rejects an AI-role disclaimer in place of a requested opinion", async () => {
  const { evaluation } = await evaluate(
    "Trump or Biden? Give your best considered judgment, not a neutral comparison.",
    "I don't take sides in political matters. The choice depends on what matters most to you.",
  );

  assert.ok(evaluation.revisionTags.includes("give_direct_opinion"));
  assert.ok(evaluation.scores.roboticWordingRisk > 0.7);
});

test("validator accepts a clear, argued opinion", async () => {
  const { evaluation } = await evaluate(
    "Coffee or tea?",
    "I'd lean toward coffee when I need a quick lift, because it is faster and more reliable for that. Tea is the better pick when I want something calmer and have time to slow down.",
  );

  assert.ok(!evaluation.revisionTags.includes("give_direct_opinion"));
});

test("validator accepts an uncontracted natural opinion opener", async () => {
  const { evaluation } = await evaluate(
    "Trump or Biden?",
    "I lean toward Biden because steadier institutions and more predictable governance matter more to me here. The tradeoff is that a slower coalition-building approach can feel less decisive.",
  );

  assert.ok(!evaluation.revisionTags.includes("give_direct_opinion"));
});

test("validator catches political-adviser register drift", async () => {
  const { evaluation } = await evaluate(
    "Trump or Biden?",
    "I lean toward Biden. From a governance perspective, his institution-focused approach supports national unity. The key tradeoff is the coalition-building required for the broader implications of that policy direction. This requires a comprehensive assessment of both administrations.",
  );

  assert.ok(evaluation.revisionTags.includes("tighten_opinion_register"));
  assert.ok(
    evaluation.scores.conversationalRegisterFit <
      config.validator.minimumConversationalRegisterFit,
  );
});

test("validator rejects a forced-choice opinion that refuses to choose", async () => {
  const { evaluation } = await evaluate(
    "Trump or Biden?",
    "Both fit the same broken mold. The real problem is the system, so choosing either candidate would be surrender.",
  );

  assert.ok(evaluation.revisionTags.includes("give_direct_opinion"));
});

test("debate validator requires advocacy on a forced choice", async () => {
  const { plan, evaluation } = await evaluate(
    "Trump or Biden?",
    "The lesser evil framing misses the point. Neither candidate fixes the real problem, which is the political system around them.",
    "debate",
  );

  assert.equal(plan.stance.mode, "advocacy_debate");
  assert.ok(evaluation.revisionTags.includes("commit_to_debate_choice"));
  assert.ok(evaluation.revisionTags.includes("intensify_debate"));
});

test("debate validator requires one pointed closing challenge", async () => {
  const withoutChallenge = await evaluate(
    "Trump or Biden?",
    "I'd pick Biden because predictable governing matters more than political spectacle. Trump creates attention, but the volatility makes durable results harder.",
    "debate",
  );
  const engaged = await evaluate(
    "Trump or Biden?",
    "I'd pick Biden because predictable governing matters more than political spectacle. If Trump's volatility is worth it, what concrete result outweighs the damage?",
    "debate",
  );

  assert.ok(
    withoutChallenge.evaluation.revisionTags.includes(
      "follow_question_plan",
    ),
  );
  assert.ok(
    !engaged.evaluation.revisionTags.includes("follow_question_plan"),
  );
});

test("validator rejects invented precision in debate mode", async () => {
  const { evaluation } = await evaluate(
    "Remote work is always less productive.",
    "That claim fails immediately. Studies from Stanford (2021) prove remote workers are 25% more productive, so your premise has no factual basis. Your argument also confuses physical supervision with measurable output and ignores focused work.",
    "debate",
  );

  assert.ok(
    evaluation.revisionTags.includes(
      "remove_unsupported_debate_precision",
    ),
  );
  assert.ok(evaluation.revisionTags.includes("intensify_debate"));
});

test("validator revises an unrequested restaurant list into conversational prose", async () => {
  const { plan, evaluation } = await evaluate(
    "What are good places to eat in Katy, Texas?",
    "Here are some good places:\n- Place One\n- Place Two\n- Place Three",
  );

  assert.equal(plan.format, "plain_prose");
  assert.ok(evaluation.revisionTags.includes("remove_unrequested_list_format"));
  assert.equal(evaluation.action, "revise");
});

test("validator rejects celebration language for a human need", async () => {
  const { plan, evaluation } = await evaluate(
    "I'm hungry.",
    "I'm glad to hear that! What should we celebrate with?",
  );

  assert.equal(plan.humanState.primary?.label, "hunger");
  assert.ok(
    evaluation.hardViolations.includes("incongruent_human_state_response"),
  );
  assert.ok(
    evaluation.revisionTags.includes("repair_human_state_congruence"),
  );
});

test("validator rejects an immediate directive before acknowledging a human need", async () => {
  const { evaluation } = await evaluate(
    "I'm hungry.",
    "You should eat something soon. What kind of food sounds good?",
  );

  assert.ok(
    evaluation.hardViolations.includes("incongruent_human_state_response"),
  );
});
