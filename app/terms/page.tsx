import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "../components/PolicyPage";

export const metadata: Metadata = {
  title: "Terms of Use — Humano Research Preview",
  description:
    "Binding terms for participating in the limited Humano research preview.",
};

export default function TermsPage() {
  return (
    <PolicyPage
      eyebrow="Binding terms of use"
      title="Use Humano at your own judgment and risk."
      summary="These Terms form a binding agreement between you and Humano’s owner and operator. They contain important disclaimers, releases, limits on liability, indemnity obligations, and a binding individual-arbitration requirement."
      effectiveDate="Effective July 30, 2026 · Version RP-2026-07-30.2"
    >
      <section className="policy-legal-warning" aria-labelledby="legal-warning">
        <p>Important legal notice</p>
        <h2 id="legal-warning">
          These Terms affect your legal rights.
        </h2>
        <p>
          Sections 10–14 include an assumption of risk, release, warranty
          disclaimer, limitation of liability, indemnity, binding individual
          arbitration, class-action waiver, and jury-trial waiver. Read them
          before selecting “Agree and enter Humano.”
        </p>
      </section>

      <section className="policy-section" id="agreement">
        <span>01</span>
        <div>
          <h2>Agreement and defined parties</h2>
          <p>
            These Terms of Use, the Privacy Policy, and the Research Preview
            Policy together form the “Agreement.” “Humano” means the Humano
            research preview and its individual owner and operator. The
            “Humano Parties” means Humano and its owner, operator, developers,
            contributors, affiliates, licensors, service providers, model
            providers, contractors, agents, successors, and assigns.
          </p>
          <p>
            By checking the required boxes and selecting “Agree and enter
            Humano,” or by accessing the preview after agreeing, you
            affirmatively accept the Agreement. If you do not agree to every
            term, do not access or use Humano. Your electronic acceptance has
            the same effect as a handwritten signature.
          </p>
        </div>
      </section>

      <section className="policy-section" id="eligibility">
        <span>02</span>
        <div>
          <h2>Eligibility and truthful access</h2>
          <p>
            You represent and warrant that you are at least 18 years old, have
            legal capacity to enter a binding contract, reside in and are
            physically located in the United States, and are using a direct
            connection. You may not access Humano through a VPN, proxy, Tor,
            location-masking service, automated agent, or by misrepresenting
            your location or identity.
          </p>
          <p>
            The preview is invitation-only, personal, revocable,
            non-transferable, and limited to evaluation use. Humano may deny,
            suspend, limit, or terminate access at any time, with or without
            notice or reason, and without liability to you.
          </p>
        </div>
      </section>

      <section className="policy-section" id="ai-risk">
        <span>03</span>
        <div>
          <h2>Experimental AI and assumption of risk</h2>
          <p>
            Humano is experimental artificial intelligence, not a person.
            Responses are generated probabilistically and may be false,
            fabricated, incomplete, outdated, biased, offensive, unsafe,
            inconsistent, or unsuitable. A confident or natural tone is not
            evidence that a response is accurate.
          </p>
          <p>
            <strong>
              You knowingly and voluntarily assume all risks arising from
              access to, use of, inability to use, or reliance on Humano,
              including foreseeable and unforeseeable risks.
            </strong>{" "}
            Those risks include personal injury, emotional distress, property
            damage, privacy loss, disclosure of information, financial loss,
            business loss, legal consequences, reputational harm, and decisions
            made or not made in response to an output.
          </p>
        </div>
      </section>

      <section className="policy-section" id="professional-use">
        <span>04</span>
        <div>
          <h2>No professional, safety, or emergency use</h2>
          <p>
            Humano does not provide medical, mental-health, legal, financial,
            tax, investment, insurance, employment, educational, engineering,
            security, or other professional advice. It is not an emergency
            service, crisis service, safety system, or substitute for a
            qualified professional.
          </p>
          <p>
            Do not use Humano to diagnose or treat a condition, make a trade,
            enter a legal commitment, operate machinery, control a vehicle,
            administer medication, respond to an emergency, or make any
            high-impact decision. Contact an appropriate professional or local
            emergency service when needed.
          </p>
        </div>
      </section>

      <section className="policy-section" id="user-responsibility">
        <span>05</span>
        <div>
          <h2>You are responsible for every decision</h2>
          <p>
            You are solely responsible for evaluating, verifying, and
            independently confirming every output before using or sharing it.
            You decide whether and how to act. Humano does not direct, control,
            endorse, or assume responsibility for your conduct, communications,
            relationships, purchases, publications, or decisions.
          </p>
          <p>
            You are also responsible for maintaining your device, connection,
            browser identifiers, and the confidentiality of preview access. You
            must promptly stop using Humano if an output appears unsafe,
            unlawful, or unreliable.
          </p>
        </div>
      </section>

      <section className="policy-section" id="acceptable-use">
        <span>06</span>
        <div>
          <h2>Prohibited conduct</h2>
          <p>
            You may not use Humano to violate law or another person’s rights;
            exploit, deceive, threaten, harass, discriminate against, or harm
            anyone; facilitate violence or self-harm; sexually exploit any
            person; create malware; steal credentials; invade privacy; conduct
            surveillance; impersonate others; or submit content you lack the
            right to provide.
          </p>
          <p>
            You may not scrape, crawl, automate, reverse engineer, benchmark
            for publication without permission, extract system instructions,
            probe security, evade safeguards, overload infrastructure, resell
            access, share invitation access, use outputs to train a competing
            model, or attempt to identify providers, prompts, private data, or
            other participants.
          </p>
        </div>
      </section>

      <section className="policy-section" id="content">
        <span>07</span>
        <div>
          <h2>Inputs, outputs, and rights</h2>
          <p>
            You retain rights you already hold in your inputs. You represent
            and warrant that your inputs are lawful, accurate where material,
            and submitted with every necessary right and permission. You grant
            the Humano Parties a worldwide, non-exclusive, royalty-free,
            sublicensable license to host, copy, transmit, process, analyze,
            modify, and use inputs as needed to operate, secure, evaluate, and
            improve Humano under the Privacy Policy.
          </p>
          <p>
            To the extent legally transferable, Humano assigns to you any right
            it may have in an output generated specifically for you. That
            assignment gives no warranty. Outputs may be non-unique, similar or
            identical to outputs provided to others, inaccurate, or subject to
            third-party rights. You are solely responsible for clearance,
            attribution, disclosure, and lawful use.
          </p>
        </div>
      </section>

      <section className="policy-section" id="research">
        <span>08</span>
        <div>
          <h2>Research, feedback, and improvement</h2>
          <p>
            You authorize Humano to evaluate conversations, outputs, behavior
            decisions, memory signals, validator scores, usage metrics, and
            feedback to operate the preview and improve later systems.
            De-identified or minimized examples may be used for evaluation,
            preference learning, safety work, and future model training as
            described in the Privacy Policy.
          </p>
          <p>
            Feedback is voluntary, non-confidential, and may be used without
            payment, attribution, restriction, or obligation to you. Do not
            provide trade secrets, passwords, government identifiers, payment
            credentials, health records, or other highly sensitive data.
          </p>
        </div>
      </section>

      <section className="policy-section" id="third-parties">
        <span>09</span>
        <div>
          <h2>Third-party systems and interactions</h2>
          <p>
            Humano depends on third-party hosting, databases, networks,
            language models, model routers, and software. The Humano Parties do
            not control and are not responsible for third-party availability,
            security, retention, outputs, policies, products, services, links,
            or conduct.
          </p>
          <p>
            Any interaction, transaction, meeting, relationship, or dispute
            between you and another person or business following a Humano
            response is solely between you and that third party.
          </p>
        </div>
      </section>

      <section className="policy-section policy-section--critical" id="release">
        <span>10</span>
        <div>
          <h2>Release of claims</h2>
          <p>
            <strong>
              To the fullest extent permitted by law, you release and forever
              discharge the Humano Parties from claims, demands, causes of
              action, losses, liabilities, and damages—known or unknown,
              suspected or unsuspected—arising from or related to your use of,
              inability to use, or reliance on Humano; any output; your
              decisions; or any third-party interaction.
            </strong>
          </p>
          <p>
            This release applies regardless of the theory asserted, including
            contract, warranty, tort, strict liability, misrepresentation,
            statute, or equity.{" "}
            <strong>
              It expressly includes claims resulting from the negligence of a
              Humano Party, whether sole, joint, or concurrent,
            </strong>{" "}
            except to the extent a claim cannot lawfully be released in
            advance.
          </p>
        </div>
      </section>

      <section
        className="policy-section policy-section--critical"
        id="warranties"
      >
        <span>11</span>
        <div>
          <h2>Disclaimer of warranties</h2>
          <p className="policy-caps">
            TO THE FULLEST EXTENT PERMITTED BY LAW, HUMANO IS PROVIDED “AS IS,”
            “AS AVAILABLE,” AND “WITH ALL FAULTS.” THE HUMANO PARTIES DISCLAIM
            ALL EXPRESS, IMPLIED, AND STATUTORY WARRANTIES, INCLUDING
            WARRANTIES OF ACCURACY, TITLE, MERCHANTABILITY, FITNESS FOR A
            PARTICULAR PURPOSE, QUIET ENJOYMENT, NON-INFRINGEMENT, SECURITY,
            PRIVACY, AVAILABILITY, COMPATIBILITY, AND ANY WARRANTY ARISING FROM
            COURSE OF DEALING OR USAGE OF TRADE.
          </p>
          <p>
            The Humano Parties do not warrant that the preview or any output
            will be correct, complete, current, safe, uninterrupted, secure,
            error-free, appropriate, or free of harmful components, or that
            defects or lost data will be corrected or restored. No statement or
            output creates a warranty unless expressly stated in a written
            agreement signed by Humano’s owner.
          </p>
        </div>
      </section>

      <section
        className="policy-section policy-section--critical"
        id="liability"
      >
        <span>12</span>
        <div>
          <h2>Maximum limitation of liability</h2>
          <p className="policy-caps">
            TO THE FULLEST EXTENT PERMITTED BY LAW, THE HUMANO PARTIES WILL NOT
            BE LIABLE FOR ANY INDIRECT, INCIDENTAL, EXEMPLARY, SPECIAL,
            PUNITIVE, RELIANCE, OR CONSEQUENTIAL DAMAGES; LOST PROFITS,
            REVENUE, DATA, GOODWILL, OPPORTUNITIES, OR BUSINESS; PERSONAL OR
            EMOTIONAL INJURY; PROPERTY DAMAGE; COST OF SUBSTITUTE SERVICES; OR
            ANY LOSS ARISING FROM AN OUTPUT, SECURITY EVENT, INTERRUPTION,
            THIRD PARTY, OR DECISION—EVEN IF ADVISED THAT SUCH LOSS WAS
            POSSIBLE.
          </p>
          <p className="policy-caps">
            THE HUMANO PARTIES’ TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS ARISING
            OUT OF OR RELATING TO HUMANO OR THIS AGREEMENT WILL NOT EXCEED THE
            GREATER OF (A) THE AMOUNT YOU PAID HUMANO FOR THE PREVIEW DURING THE
            SIX MONTHS BEFORE THE EVENT GIVING RISE TO LIABILITY OR (B) TEN
            U.S. DOLLARS (US $10).
          </p>
          <p>
            These allocations are an essential basis of the Agreement and
            apply to all legal theories and even if a limited remedy fails of
            its essential purpose. Nothing excludes liability that applicable
            law prohibits the parties from excluding.
          </p>
        </div>
      </section>

      <section
        className="policy-section policy-section--critical"
        id="indemnity"
      >
        <span>13</span>
        <div>
          <h2>Your duty to defend and indemnify</h2>
          <p>
            To the fullest extent permitted by law, you will defend, indemnify,
            and hold harmless the Humano Parties from every third-party claim,
            demand, investigation, proceeding, judgment, settlement, penalty,
            loss, liability, damage, and expense—including reasonable
            attorneys’ fees and costs—arising from or related to your inputs,
            outputs you use or distribute, your conduct or decisions, your
            violation of this Agreement or law, your infringement of another
            person’s rights, or your misuse of Humano.
          </p>
          <p>
            Humano may control the defense and settlement of an indemnified
            matter. You will cooperate fully and may not settle a matter that
            imposes liability, admission, or obligation on a Humano Party
            without prior written consent.
          </p>
        </div>
      </section>

      <section
        className="policy-section policy-section--critical"
        id="disputes"
      >
        <span>14</span>
        <div>
          <h2>Binding individual arbitration</h2>
          <div className="policy-arbitration-notice">
            <strong>
              YOU AND HUMANO AGREE TO RESOLVE COVERED DISPUTES ONLY THROUGH
              BINDING INDIVIDUAL ARBITRATION. YOU GIVE UP THE RIGHT TO HAVE A
              JUDGE OR JURY DECIDE THE DISPUTE AND THE RIGHT TO PARTICIPATE IN A
              CLASS, COLLECTIVE, CONSOLIDATED, MASS, OR REPRESENTATIVE ACTION.
            </strong>
          </div>
          <p>
            Before starting arbitration, the complaining party must send the
            other a detailed written notice and allow 60 days for a good-faith
            informal resolution. A notice to Humano must be delivered through
            the preview organizer who provided access. The notice must identify
            the claimant, describe the facts and legal basis, state the specific
            relief requested, and include the claimant’s session identifier
            where available.
          </p>
          <p>
            Except for matters eligible for an individual small-claims court,
            every dispute, claim, or controversy arising out of or relating to
            Humano, the Agreement, an output, privacy, security, access,
            termination, or the relationship between you and a Humano Party
            will be resolved by one neutral arbitrator under the Federal
            Arbitration Act and the American Arbitration Association’s Consumer
            Arbitration Rules then in effect. The arbitration may proceed by
            video, telephone, documents, or in the county where you reside, as
            the applicable rules permit.
          </p>
          <p>
            You will not be required to pay more than the consumer filing fee
            required by the applicable AAA rules, and Humano will pay the
            amounts those rules require a business to pay. If AAA is unavailable
            or declines to administer a dispute despite the parties’ compliance,
            the parties will use JAMS under its consumer standards or ask a
            court to appoint a substitute arbitrator under 9 U.S.C. § 5. The
            parties intend to arbitrate and not litigate solely because a named
            administrator is unavailable.
          </p>
          <p>
            The arbitrator has exclusive authority to resolve disputes about
            interpretation, scope, applicability, enforceability, or formation
            of this arbitration agreement, except that a court decides whether
            the class-action waiver is enforceable. The arbitrator may grant
            relief available to an individual claimant but may not combine
            claims or award relief for anyone other than the individual parties.
          </p>
          <p>
            Either party may seek temporary or injunctive relief in court to
            protect intellectual property, confidential information, system
            security, or access controls without waiving arbitration. If any
            portion of this Section is unenforceable, it will be severed to the
            narrowest extent possible; however, if the class-action waiver is
            unenforceable as to a particular claim, that claim must proceed in
            court and not in class arbitration.
          </p>
        </div>
      </section>

      <section className="policy-section" id="law-and-deadline">
        <span>15</span>
        <div>
          <h2>Texas law and claim deadline</h2>
          <p>
            The Federal Arbitration Act governs Section 14. Otherwise, Texas
            law governs the Agreement, without regard to conflict-of-law rules,
            except where the law of your state cannot lawfully be displaced.
            Any court proceeding permitted under the Agreement must be brought
            exclusively in a state or federal court located in Texas, and you
            consent to personal jurisdiction and venue there.
          </p>
          <p>
            <strong>
              To the fullest extent permitted by law, any claim must be filed
              within one year after it arose or it is permanently barred.
            </strong>{" "}
            This deadline does not shorten a limitation period that applicable
            law does not allow the parties to shorten.
          </p>
        </div>
      </section>

      <section className="policy-section" id="general">
        <span>16</span>
        <div>
          <h2>General terms</h2>
          <p>
            Humano may modify the preview and may update the Agreement
            prospectively. A material update will use a new consent version and
            may require acceptance before further access. Continued use after
            valid acceptance of revised terms means you agree to them. Terms
            that by nature should survive—including rights in content,
            research use, release, disclaimers, liability limits, indemnity,
            dispute resolution, and governing law—survive termination.
          </p>
          <p>
            You may not assign the Agreement without written permission.
            Humano may assign it in connection with a reorganization, transfer,
            financing, or sale. Failure to enforce a provision is not a waiver.
            If a provision is unenforceable, it will be narrowed or severed and
            the remainder will continue. The Agreement is the entire agreement
            about the preview and supersedes prior statements on that subject.
            Headings are for convenience only.
          </p>
          <p>
            Policy questions, arbitration notices, and legal notices must be
            sent to the preview organizer who provided your invitation. Before
            any broader public release, Humano may publish a dedicated legal
            notice address that replaces that delivery method.
          </p>
        </div>
      </section>

      <section className="policy-callout policy-callout--closing">
        <p>Before you enter</p>
        <h2>Natural conversation does not transfer responsibility.</h2>
        <p>
          You remain responsible for verifying outputs, protecting your
          information, and deciding what to do. Review the{" "}
          <Link href="/privacy">Privacy Policy</Link> and{" "}
          <Link href="/research-preview">Research Preview Policy</Link> before
          agreeing.
        </p>
      </section>
    </PolicyPage>
  );
}
