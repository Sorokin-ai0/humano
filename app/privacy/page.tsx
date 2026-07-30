import type { Metadata } from "next";
import { PolicyPage } from "../components/PolicyPage";

export const metadata: Metadata = {
  title: "Privacy Policy — Humano Research Preview",
  description:
    "How data is handled during the limited Humano research preview.",
};

export default function PrivacyPage() {
  return (
    <PolicyPage
      eyebrow="Privacy policy"
      title="What the preview remembers—and why."
      summary="Humano needs conversation context to feel continuous. This policy explains the information used to run the preview, evaluate its behavior, and protect access."
    >
      <section
        className="policy-callout"
        aria-labelledby="privacy-plain-language"
      >
        <p>In plain language</p>
        <h2 id="privacy-plain-language">
          Don’t tell Humano anything you would not want processed by an AI
          service.
        </h2>
        <p>
          Conversations may be retained for the preview and may be processed
          by infrastructure and model providers. Avoid passwords, financial
          account details, health records, or other highly sensitive data.
        </p>
      </section>

      <section className="policy-section" id="collection">
        <span>01</span>
        <div>
          <h2>Information collected</h2>
          <p>
            Humano processes your messages, the model’s replies, feedback,
            selected mode, and conversational details you explicitly share.
            The behavior layer may extract useful facts, preferences, goals,
            or continuity notes so later turns make sense.
          </p>
          <p>
            The preview also uses randomly generated browser identifiers,
            session identifiers, consent status, model preference, timestamps,
            token and latency measurements, planner decisions, validator
            scores, and error records. IP address, country signal, user agent,
            and request metadata may be processed to limit abuse, enforce
            geographic access, diagnose failures, and secure the service.
          </p>
          <p>
            When you accept the preview agreement, Humano stores a consent
            receipt containing the agreement version, acceptance time, browser
            session and subject identifiers, country signal, acceptance method,
            and a one-way technical evidence hash derived from request
            information. The receipt does not store your raw IP address in its
            evidence field.
          </p>
        </div>
      </section>

      <section className="policy-section" id="use">
        <span>02</span>
        <div>
          <h2>How information is used</h2>
          <p>
            Information is used to provide the conversation, maintain context
            and memory, apply safety and access rules, prevent abuse, measure
            performance, investigate errors, and understand which behavior
            choices make conversation feel more natural.
          </p>
          <p>
            Feedback, planner outputs, validator scores, and conversation
            examples may be evaluated to improve Humano and prepare future
            training or preference data. Raw training-event content is not
            enabled by default in this preview, but ordinary conversation
            records are still stored for operating and evaluating the service.
          </p>
        </div>
      </section>

      <section className="policy-section" id="sharing">
        <span>03</span>
        <div>
          <h2>Service providers</h2>
          <p>
            Humano uses Cloudflare-based hosting and storage and routes model
            requests through OpenRouter to an underlying AI model provider.
            Those providers receive the information needed to perform their
            part of a request and apply their own security, retention, and
            legal practices.
          </p>
          <p>
            Humano configures model data collection as denied where supported.
            Provider policies and routing capabilities can differ, so this
            preview does not promise that every inference request has
            zero-data-retention treatment. Humano does not sell personal
            information or use it for targeted advertising.
          </p>
        </div>
      </section>

      <section className="policy-section" id="storage">
        <span>04</span>
        <div>
          <h2>Storage and retention</h2>
          <p>
            Your browser stores random session and subject identifiers, your
            model preference, and a versioned consent cookie. The consent
            cookie lasts up to 180 days unless it is cleared or replaced.
            Clearing browser storage removes local identifiers and consent,
            but does not automatically delete records already held by the
            service.
          </p>
          <p>
            Conversation, memory, feedback, security, and operational records
            may be kept for the duration of the preview and a reasonable period
            afterward for evaluation, security, legal obligations, and system
            improvement. Data no longer needed should be deleted or
            de-identified when practical.
          </p>
          <p>
            Consent receipts may be retained for as long as reasonably needed
            to document the agreement, establish or defend legal claims,
            resolve disputes, and comply with law, even after other preview data
            is deleted.
          </p>
        </div>
      </section>

      <section className="policy-section" id="choices">
        <span>05</span>
        <div>
          <h2>Your choices</h2>
          <p>
            You can stop using the preview at any time, clear site data in your
            browser, avoid sharing sensitive information, and decline optional
            feedback. To ask for access to or deletion of preview data, contact
            the organizer who shared your invitation and include the browser
            session identifier if available.
          </p>
          <p>
            Because there are no accounts, Humano may need additional details
            to locate a record and may be unable to connect a browser
            identifier to you after local storage is cleared.
            Certain consent, security, and legal records may be retained when
            deletion is not required by law.
          </p>
        </div>
      </section>

      <section className="policy-section" id="security">
        <span>06</span>
        <div>
          <h2>Security, eligibility, and changes</h2>
          <p>
            Reasonable technical and organizational safeguards are used, but no
            online service is completely secure. This preview is intended only
            for adults in the United States and is not directed to children.
          </p>
          <p>
            Material policy changes may require a new consent. Questions or
            privacy requests should be sent to the preview organizer who shared
            your invitation.
          </p>
        </div>
      </section>
    </PolicyPage>
  );
}
