import type { Metadata } from "next";
import { PolicyPage } from "../components/PolicyPage";

export const metadata: Metadata = {
  title: "Research Preview Policy — Humano",
  description:
    "Known limitations and participation rules for the Humano research preview.",
};

export default function ResearchPreviewPage() {
  return (
    <PolicyPage
      eyebrow="Research preview policy"
      title="Real conversation. Experimental system."
      summary="This release is meant to test conversational judgment with a small group—not to present Humano as a finished or universally reliable product."
    >
      <section className="policy-callout" aria-labelledby="preview-purpose">
        <p>The purpose</p>
        <h2 id="preview-purpose">
          We’re testing whether better judgment can make AI conversation feel
          meaningfully more natural.
        </h2>
        <p>
          Participant feedback helps identify emotional mistakes, robotic
          patterns, poor questions, weak opinions, repetition, and moments
          where the system sounds confident without earning it.
        </p>
      </section>

      <section className="policy-section" id="status">
        <span>01</span>
        <div>
          <h2>Preview status</h2>
          <p>
            Humano is an experimental behavior layer powered by an AI language
            model. Features may be unfinished, unavailable, slow, or changed
            during testing. Conversation history and memory can be incomplete
            or lost.
          </p>
          <p>
            The preview is invitation-only, for adults who reside in and are
            physically located in the United States. Participants must use a
            direct connection without a VPN, proxy, Tor, or location-masking
            service.
          </p>
        </div>
      </section>

      <section className="policy-section" id="known-risks">
        <span>02</span>
        <div>
          <h2>Known risks</h2>
          <p>
            Humano may invent facts, misread emotion, remember something
            incorrectly, express an unjustified opinion, echo bias, miss
            context, or give advice that sounds more confident than it should.
            Its natural conversational style can make these mistakes easier to
            trust.
          </p>
          <p>
            Verify important claims independently. Do not use the preview as
            the sole basis for medical, legal, financial, employment,
            educational, safety, or other high-impact decisions.
          </p>
        </div>
      </section>

      <section className="policy-section" id="participation">
        <span>03</span>
        <div>
          <h2>Good participation</h2>
          <p>
            Talk naturally, challenge the system, and report responses that are
            confusing, manipulative, unsafe, repetitive, or strangely robotic.
            Use feedback controls when they capture your reaction, but do not
            submit confidential or highly sensitive information just to test
            the model.
          </p>
          <p>
            Do not intentionally use the preview to harm another person,
            generate illegal material, attack the service, evade restrictions,
            or expose someone else’s private information.
          </p>
        </div>
      </section>

      <section className="policy-section" id="research-use">
        <span>04</span>
        <div>
          <h2>Learning from the preview</h2>
          <p>
            Humano may analyze conversations, planner decisions, model
            responses, validator scores, and participant feedback to compare
            behavior patterns and improve later releases. These signals may
            inform evaluation datasets, preference data, and future model
            training.
          </p>
          <p>
            The goal is to learn which conversational decisions work—not to
            encourage participants to disclose personal information.
            Unnecessary personal details should be removed or de-identified
            when examples are prepared for longer-term research use.
          </p>
        </div>
      </section>

      <section className="policy-section" id="availability">
        <span>05</span>
        <div>
          <h2>Access and changes</h2>
          <p>
            Access may be rate-limited, suspended, or ended as the preview
            evolves. A revised agreement may be required when participation
            terms, data practices, or material risks change.
          </p>
          <p>
            Questions, data requests, and serious response reports should be
            sent to the preview organizer who shared your invitation.
          </p>
        </div>
      </section>
    </PolicyPage>
  );
}
