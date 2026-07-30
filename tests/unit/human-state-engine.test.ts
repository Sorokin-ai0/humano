import assert from "node:assert/strict";
import test from "node:test";
import { loadHumanoConfig } from "../../src/humano/config/load-config";
import { ConfigurableHumanStateEngine } from "../../src/humano/engines/state/configurable-human-state-engine";

const config = loadHumanoConfig();
const states = new ConfigurableHumanStateEngine(config.planner.humanState);

test("human-state engine recognizes hunger as a need rather than a positive emotion", async () => {
  const result = await states.assess({ text: "I'm hungry." });

  assert.equal(result.primary?.label, "hunger");
  assert.equal(result.primary?.valence, "need");
  assert.equal(result.primary?.allowFollowUp, true);
  assert.ok(result.signals.includes("hunger:pattern"));
});

test("human-state engine prioritizes illness over a more general physical discomfort", async () => {
  const result = await states.assess({ text: "I'm sick and my stomach hurts." });

  assert.equal(result.primary?.label, "illness");
  assert.deepEqual(result.matchedLabels, ["illness", "physical_discomfort"]);
});

test("human-state engine leaves ordinary factual requests alone", async () => {
  const result = await states.assess({ text: "What is the capital of Japan?" });

  assert.equal(result.primary, null);
  assert.deepEqual(result.matchedLabels, []);
});

test("human-state engine does not match a state inside an unrelated word", async () => {
  const result = await states.assess({ text: "I'm still deciding which route to take." });

  assert.equal(result.primary, null);
  assert.deepEqual(result.matchedLabels, []);
});

test("human-state engine recognizes distinct vulnerable and positive states", async () => {
  const [anxiety, grief, anticipation] = await Promise.all([
    states.assess({ text: "I'm anxious and I keep spiraling about tomorrow." }),
    states.assess({ text: "I lost my dad recently and I miss him so much." }),
    states.assess({ text: "I can't wait for the trip next week." }),
  ]);

  assert.equal(anxiety.primary?.label, "anxiety");
  assert.equal(anxiety.primary?.valence, "support");
  assert.equal(grief.primary?.label, "grief");
  assert.equal(grief.primary?.valence, "support");
  assert.equal(anticipation.primary?.label, "anticipation");
  assert.equal(anticipation.primary?.valence, "pleasant");
});
