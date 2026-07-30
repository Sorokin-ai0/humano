import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { EditorialHeader } from "../components/EditorialHeader";

export const metadata: Metadata = {
  title: "Meet Humano-1 — The conversation layer",
  description:
    "Why Humano-1 treats natural conversation as a problem of judgment, not just generation.",
};

export default function MeetHumanoOne() {
  return (
    <main className="editorial-page">
      <EditorialHeader note="Field note · 01" />

      <article className="editorial-article">
        <header className="editorial-hero">
          <p className="editorial-kicker">Meet Humano-1</p>
          <h1>
            The intelligence wasn’t missing. <em>The conversation was.</em>
          </h1>
          <div className="editorial-deck">
            <p>
              Language models learned how to answer almost anything. They still
              didn’t learn what a thoughtful person would naturally say next.
              Humano-1 begins there.
            </p>
            <span>Humano research note · July 2026</span>
          </div>
        </header>

        <section className="editorial-opening">
          <div className="editorial-opening-copy">
            <p className="editorial-drop">
              A model can know the answer and still ruin the conversation.
            </p>
            <p>
              Ask it how it’s doing and it explains that it’s software. Say
              you’re hungry and it congratulates you. Ask for advice and it
              races into a polished plan before learning the one detail that
              changes everything. None of those failures are really about
              knowledge. They’re failures of judgment.
            </p>
            <p>
              Humano-1 is an independent behavior layer around an open-weight
              language model. It doesn’t try to manufacture humanity with
              typos, filler words, or a fictional life. It makes a sequence of
              conversational decisions before generation—and then checks the
              answer after generation—so the reply fits the actual moment.
            </p>
          </div>
          <figure className="editorial-portrait">
            <Image
              src="/humano-hero.webp"
              alt="A portrait blending a human face with code and concepts such as empathy, memory, and understanding."
              width={1024}
              height={1536}
              sizes="(max-width: 760px) 86vw, 34vw"
              unoptimized
            />
            <figcaption>
              Human conversational judgment, expressed as a system.
            </figcaption>
          </figure>
        </section>

        <section className="editorial-chapter">
          <div className="editorial-chapter-label">
            <span>01</span>
            <p>The missing layer</p>
          </div>
          <div className="editorial-copy">
            <h2>Generation is powerful. It is not the same as conversation.</h2>
            <p>
              A normal conversation is full of choices that happen before the
              words arrive. Is this person asking for an answer or looking to
              be understood? Do they need a recommendation, or would a single
              question prevent a bad one? Is a long explanation useful here,
              or would it feel like being talked at?
            </p>
            <p>
              Foundation models are usually asked to infer all of that while
              simultaneously producing the response. The result can be smart
              sentence by sentence and still feel socially wrong. Humano
              separates the judgment from the prose. A planner decides the
              response act, depth, stance, emotional posture, memory use, and
              question policy. The model’s job becomes narrower: express that
              decision naturally.
            </p>
            <blockquote>
              Naturalness isn’t the presence of human-sounding words. It’s the
              absence of bad conversational decisions.
            </blockquote>
          </div>
        </section>

        <section className="editorial-chapter">
          <div className="editorial-chapter-label">
            <span>02</span>
            <p>Designed judgment</p>
          </div>
          <div className="editorial-copy">
            <h2>One reply passes through a room full of quiet decisions.</h2>
            <p>
              Humano reads emotional signals independently, so frustration can
              coexist with urgency and confidence can coexist with uncertainty.
              It retrieves only memories that might genuinely help. It
              classifies what kind of conversational task is happening and how
              much explanation that task owes the user.
            </p>
            <p>
              Then the planner commits. It decides whether to answer
              immediately, ask one focused question, disagree, show empathy,
              take a side, or simply respond like a person in a casual exchange.
              That commitment is explicit, inspectable, and eventually
              trainable.
            </p>
            <div className="editorial-principles">
              <article>
                <span>Restraint</span>
                <h3>Short isn’t the goal. Sufficiency is.</h3>
                <p>
                  Humano stops when the user can understand and act—not at an
                  arbitrary sentence count.
                </p>
              </article>
              <article>
                <span>Memory</span>
                <h3>Continuity without performance.</h3>
                <p>
                  Useful context is woven in quietly. The system never announces
                  that it searched or remembered.
                </p>
              </article>
              <article>
                <span>Character</span>
                <h3>Consistent, not theatrical.</h3>
                <p>
                  Calm, curious, honest, and occasionally funny—without
                  pretending to have a human life.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="editorial-chapter">
          <div className="editorial-chapter-label">
            <span>03</span>
            <p>From layer to model</p>
          </div>
          <div className="editorial-copy">
            <h2>Humano-1 is also a blueprint for what comes next.</h2>
            <p>
              Every planner decision, validator score, selected candidate, and
              user preference signal can become training data without storing
              hidden reasoning. That makes the orchestration layer more than a
              product wrapper. It is a way to define the behavior Humano-1.5
              will later absorb through fine-tuning and preference learning.
            </p>
            <p>
              The long-term goal is not to keep adding prompts forever. It is
              to discover which judgments make conversation feel genuinely
              better, measure them, and teach the model to make more of those
              judgments itself.
            </p>
          </div>
        </section>

        <Link className="editorial-next" href="/inside-humano">
          <span>Continue reading</span>
          <strong>Inside the behavior layer</strong>
          <small>Seven decisions before one reply reaches you.</small>
          <span aria-hidden="true">→</span>
        </Link>
      </article>
    </main>
  );
}
