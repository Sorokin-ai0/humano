import type { Metadata } from "next";
import Link from "next/link";
import { EditorialHeader } from "../components/EditorialHeader";

export const metadata: Metadata = {
  title: "Inside Humano — Seven decisions before a reply",
  description:
    "A deeper look at the modular behavior system behind Humano-1.",
};

const stages = [
  {
    number: "01",
    name: "Read the moment",
    detail:
      "The conversation engine reconstructs the active turn, recent context, mode, and available response budget without asking the model to manage the session.",
    output: "A bounded conversational state",
  },
  {
    number: "02",
    name: "Separate feeling from need",
    detail:
      "Emotion probabilities capture frustration, curiosity, sadness, urgency, and uncertainty. A separate human-state engine catches hunger, fatigue, stress, illness, loneliness, and other needs that should not be treated as positive events.",
    output: "Emotional and human-state signals",
  },
  {
    number: "03",
    name: "Remember selectively",
    detail:
      "Humano retrieves preferences, goals, important facts, and profile details only when they might improve this turn. Secrets and momentary emotional guesses never become long-term memory.",
    output: "Relevant context, not a biography dump",
  },
  {
    number: "04",
    name: "Choose the conversational act",
    detail:
      "The planner decides whether to answer, clarify, support, disagree, express a considered opinion, or debate. It also commits to one question at most and sets the useful depth before generation begins.",
    output: "An explicit response plan",
  },
  {
    number: "05",
    name: "Compose without contaminating",
    detail:
      "Memory and conversation history enter the prompt as untrusted context, while personality and current-turn instructions remain authoritative. Earlier assistant mistakes are context, not style examples.",
    output: "A provider-neutral prompt envelope",
  },
  {
    number: "06",
    name: "Generate, filter, and challenge",
    detail:
      "The base model writes the candidate. Naturalness filters remove hidden reasoning, canned phrasing, analyst drift, needless lists, and side-rants. A validator checks sufficiency, emotional fit, confidence, question quality, repetition, and conversational register.",
    output: "A reply that earns its place",
  },
  {
    number: "07",
    name: "Learn from the outcome",
    detail:
      "Planner choices, validation results, model provenance, filters, and user feedback become versioned training events. The system records what happened without preserving private hidden reasoning.",
    output: "A future Humano-1.5 training signal",
  },
] as const;

export default function InsideHumano() {
  return (
    <main className="editorial-page editorial-page--inside">
      <EditorialHeader note="Field note · 02" />

      <article className="editorial-article">
        <header className="editorial-hero editorial-hero--inside">
          <p className="editorial-kicker">Inside the behavior layer</p>
          <h1>
            Seven decisions happen before <em>one reply</em> reaches you.
          </h1>
          <div className="editorial-deck">
            <p>
              Humano’s innovation is not a single giant prompt. It is a modular
              system of small, testable judgments that can be replaced,
              measured, and eventually trained.
            </p>
            <span>Systems note · Architecture 01</span>
          </div>
        </header>

        <section className="inside-introduction">
          <p>
            If every conversational behavior lives inside one system prompt,
            nothing is easy to measure. Brevity competes with completeness.
            Empathy competes with directness. Memory competes with privacy. A
            model can satisfy one sentence while silently ignoring another.
          </p>
          <p>
            Humano turns those tensions into explicit stages. Each stage has a
            typed input, a defined output, configuration, tests, and training
            value. The model remains replaceable; the conversational
            intelligence belongs to the system.
          </p>
        </section>

        <section className="inside-stages" aria-label="Humano response stages">
          {stages.map((stage) => (
            <article key={stage.number}>
              <span className="inside-stage-number">{stage.number}</span>
              <div>
                <h2>{stage.name}</h2>
                <p>{stage.detail}</p>
              </div>
              <strong>{stage.output}</strong>
            </article>
          ))}
        </section>

        <section className="inside-thesis">
          <p className="editorial-kicker">The larger bet</p>
          <h2>Human-feeling AI will come from better judgment, not better imitation.</h2>
          <div>
            <p>
              Deliberate mistakes, filler words, and fake lived experience can
              make a model look human for a moment. They cannot make it good at
              conversation. The harder problem is knowing what the moment calls
              for and resisting everything it does not.
            </p>
            <p>
              Humano treats that judgment as engineering: observable,
              configurable, and open to learning. That is the bridge from
              Humano-1’s orchestration layer to a future model that carries the
              behavior within its weights.
            </p>
          </div>
        </section>

        <Link className="editorial-next editorial-next--home" href="/">
          <span>Ready to feel the difference?</span>
          <strong>Talk to Humano</strong>
          <small>Choose Humano-1 or the faster H1 model.</small>
          <span aria-hidden="true">→</span>
        </Link>
      </article>
    </main>
  );
}
