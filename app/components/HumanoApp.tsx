"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

type Role = "user" | "assistant";
type HealthState = "checking" | "ready" | "needs_configuration" | "offline";
type Feedback = "positive" | "negative";
type ConversationMode = "standard" | "debate";
type ModelVariant = "humano-1" | "h1";
type DataScreen = "overview" | "confirm";
type ConsentState = "checking" | "required" | "saving" | "accepted";

interface ConsentChecks {
  ageConfirmed: boolean;
  unitedStatesConfirmed: boolean;
  directConnectionConfirmed: boolean;
  aiRiskAccepted: boolean;
  policiesAccepted: boolean;
  disputeTermsAccepted: boolean;
}

interface SlashCommand {
  id: Exclude<ConversationMode, "standard">;
  command: string;
  label: string;
  description: string;
}

interface ConversationMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
  feedback?: Feedback;
}

const storageKeys = {
  session: "humano.session.v1",
  subject: "humano.subject.v1",
  modelVariant: "humano.model-variant.v1",
} as const;

const slashCommands: SlashCommand[] = [
  {
    id: "debate",
    command: "/debate",
    label: "Debate",
    description: "Pressure-test a position with a relentless counter-case.",
  },
];

const initialConsentChecks: ConsentChecks = {
  ageConfirmed: false,
  unitedStatesConfirmed: false,
  directConnectionConfirmed: false,
  aiRiskAccepted: false,
  policiesAccepted: false,
  disputeTermsAccepted: false,
};

export function HumanoApp() {
  const [entered, setEntered] = useState(false);
  const [landingLeaving, setLandingLeaving] = useState(false);
  const [consentState, setConsentState] =
    useState<ConsentState>("checking");
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentChecks, setConsentChecks] = useState<ConsentChecks>(
    initialConsentChecks,
  );
  const [consentError, setConsentError] = useState("");
  const [dataOpen, setDataOpen] = useState(false);
  const [dataScreen, setDataScreen] = useState<DataScreen>("overview");
  const [deletingData, setDeletingData] = useState(false);
  const [dataError, setDataError] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [health, setHealth] = useState<HealthState>("checking");
  const [hydrating, setHydrating] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [memoryNotice, setMemoryNotice] = useState("");
  const [activeMode, setActiveMode] =
    useState<ConversationMode>("standard");
  const [modelVariant, setModelVariant] =
    useState<ModelVariant>("humano-1");
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [commandMenuDismissed, setCommandMenuDismissed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  const commandQuery = /^\/[^\s]*$/u.test(draft)
    ? draft.slice(1).toLocaleLowerCase()
    : null;
  const visibleCommands = useMemo(
    () =>
      commandQuery === null
        ? []
        : slashCommands.filter((command) =>
            command.command.slice(1).startsWith(commandQuery),
          ),
    [commandQuery],
  );
  const commandMenuOpen =
    !commandMenuDismissed &&
    !sending &&
    commandQuery !== null &&
    visibleCommands.length > 0;

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      const nextSession = getOrCreateId(storageKeys.session);
      const nextSubject = getOrCreateId(storageKeys.subject);
      const storedModelVariant = localStorage.getItem(
        storageKeys.modelVariant,
      );
      setSessionId(nextSession);
      setSubjectId(nextSubject);
      if (
        storedModelVariant === "humano-1" ||
        storedModelVariant === "h1"
      ) {
        setModelVariant(storedModelVariant);
      }

      await Promise.all([
        fetch("/api/health", { cache: "no-store" })
          .then(async (response) => {
            const body = (await response.json()) as {
              status?: HealthState;
            };
            if (!active) return;
            setHealth(
              response.ok && body.status === "ready"
                ? "ready"
                : "needs_configuration",
            );
          })
          .catch(() => {
            if (active) setHealth("offline");
          }),
        fetch("/api/consent", { cache: "no-store" })
          .then(async (response) => {
            const body = (await response.json()) as {
              accepted?: boolean;
            };
            if (!active) return;
            if (!body.accepted) {
              setConsentState("required");
              return;
            }
            setConsentState("accepted");
            const turns = await fetchSessionTurns(nextSession);
            if (active) setMessages(turns);
          })
          .catch(() => {
            if (active) {
              setConsentState("required");
              setConsentError(
                "The research preview agreement couldn't be checked. Try again.",
              );
            }
          })
          .finally(() => {
            if (active) setHydrating(false);
          }),
      ]);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({
      behavior: sending ? "smooth" : "auto",
      block: "end",
    });
  }, [messages, sending]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [draft]);

  async function submitMessage(event?: FormEvent) {
    event?.preventDefault();
    const rawMessage = draft.trim();
    const slashMatch = /^\/(\w+)(?:\s+([\s\S]+))?$/u.exec(rawMessage);
    let message = rawMessage;
    let requestMode = activeMode;
    if (slashMatch) {
      const command = slashCommands.find(
        (candidate) => candidate.command.slice(1) === slashMatch[1],
      );
      if (!command) {
        setError(`Unknown command: /${slashMatch[1]}`);
        return;
      }
      activateMode(command.id);
      requestMode = command.id;
      message = slashMatch[2]?.trim() ?? "";
      if (!message) return;
    }
    if (!message || sending || !sessionId || !subjectId) return;

    const optimisticId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      {
        id: optimisticId,
        role: "user",
        content: message,
        createdAt: new Date().toISOString(),
      },
    ]);
    setDraft("");
    setError("");
    setSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          subjectId,
          message,
          mode: requestMode,
          modelVariant,
        }),
      });
      const body = (await response.json()) as {
        turnId?: string;
        response?: string;
        error?: { message?: string };
      };
      if (!response.ok || !body.response || !body.turnId) {
        throw new Error(body.error?.message ?? "Humano couldn't answer that.");
      }
      setMessages((current) => [
        ...current,
        {
          id: body.turnId as string,
          role: "assistant",
          content: body.response as string,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Humano couldn't answer that.",
      );
    } finally {
      setSending(false);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (commandMenuOpen) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setSelectedCommandIndex((current) =>
          (current + direction + visibleCommands.length) %
          visibleCommands.length,
        );
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setCommandMenuDismissed(true);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const command = visibleCommands[selectedCommandIndex];
        if (command) activateMode(command.id);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  }

  function activateMode(mode: ConversationMode) {
    setActiveMode(mode);
    setDraft("");
    setSelectedCommandIndex(0);
    setCommandMenuDismissed(true);
    setError("");
    setMemoryNotice(
      mode === "debate"
        ? "Debate mode on. Make a claim and Humano will push back hard."
        : "Standard conversation restored.",
    );
    window.setTimeout(() => setMemoryNotice(""), 3600);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function selectModelVariant(variant: ModelVariant) {
    if (sending || variant === modelVariant) return;
    setModelVariant(variant);
    localStorage.setItem(storageKeys.modelVariant, variant);
    setMemoryNotice(
      variant === "h1"
        ? "H1 selected — faster, lighter answers."
        : "Humano-1 selected — full conversational depth.",
    );
    window.setTimeout(() => setMemoryNotice(""), 3200);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function startFresh() {
    if (!sessionId || !subjectId || sending) return;
    setError("");
    try {
      await fetch(
        `/api/session?sessionId=${encodeURIComponent(sessionId)}&subjectId=${encodeURIComponent(subjectId)}&forget=false`,
        { method: "DELETE" },
      );
    } catch {
      // A fresh client session can still begin if server cleanup is unavailable.
    }

    const nextSession = crypto.randomUUID();
    localStorage.setItem(storageKeys.session, nextSession);
    setSessionId(nextSession);
    setMessages([]);
    setActiveMode("standard");
    setMemoryNotice("New conversation. Long-term preferences are still available.");
    window.setTimeout(() => setMemoryNotice(""), 4200);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function deleteAllData() {
    if (!subjectId || deletingData || sending) return;
    setDeletingData(true);
    setDataError("");
    try {
      const response = await fetch("/api/data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, confirmed: true }),
      });
      const body = (await response.json()) as {
        deleted?: boolean;
        error?: { message?: string };
      };
      if (!response.ok || !body.deleted) {
        throw new Error(body.error?.message ?? "Your data could not be deleted.");
      }

      Object.values(storageKeys).forEach((key) => localStorage.removeItem(key));
      const nextSession = getOrCreateId(storageKeys.session);
      const nextSubject = getOrCreateId(storageKeys.subject);
      setMessages([]);
      setDraft("");
      setSessionId(nextSession);
      setSubjectId(nextSubject);
      setActiveMode("standard");
      setDataOpen(false);
      setDataScreen("overview");
      setConsentChecks(initialConsentChecks);
      setConsentState("required");
      setConsentOpen(false);
      setMemoryNotice("");
      setHydrating(false);
      setLandingLeaving(false);
      setEntered(false);
    } catch (deletionError) {
      setDataError(
        deletionError instanceof Error
          ? deletionError.message
          : "Your data could not be deleted.",
      );
    } finally {
      setDeletingData(false);
    }
  }

  async function sendFeedback(turnId: string, rating: Feedback) {
    const previousFeedback = messages.find(
      (message) => message.id === turnId,
    )?.feedback;
    setMessages((current) =>
      current.map((message) =>
        message.id === turnId ? { ...message, feedback: rating } : message,
      ),
    );
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, turnId, rating }),
      });
      if (!response.ok) throw new Error("Feedback could not be saved.");
    } catch {
      setMessages((current) =>
        current.map((message) =>
          message.id === turnId
            ? { ...message, feedback: previousFeedback }
            : message,
        ),
      );
      setError("That feedback didn't save. Please try again.");
    }
  }

  const hasConversation = messages.length > 0;
  const canSend =
    draft.trim().length > 0 &&
    !sending &&
    health === "ready" &&
    !hydrating;

  function enterHumano() {
    if (landingLeaving) return;
    if (consentState !== "accepted") {
      setConsentOpen(true);
      return;
    }
    completeEntry();
  }

  function completeEntry() {
    setLandingLeaving(true);
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.setTimeout(
      () => {
        setEntered(true);
        requestAnimationFrame(() => textareaRef.current?.focus());
      },
      prefersReducedMotion ? 0 : 520,
    );
  }

  function updateConsentCheck(
    field: keyof ConsentChecks,
    checked: boolean,
  ) {
    setConsentChecks((current) => ({ ...current, [field]: checked }));
    setConsentError("");
  }

  async function acceptResearchPreview(event: FormEvent) {
    event.preventDefault();
    const allConfirmed = Object.values(consentChecks).every(Boolean);
    if (!allConfirmed || consentState === "saving") return;

    setConsentState("saving");
    setConsentError("");
    try {
      const response = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          {
            sessionId,
            subjectId,
            ...Object.fromEntries(
              Object.keys(consentChecks).map((key) => [key, true]),
            ),
          },
        ),
      });
      const body = (await response.json()) as {
        accepted?: boolean;
        error?: { message?: string };
      };
      if (!response.ok || !body.accepted) {
        throw new Error(
          body.error?.message ?? "The agreement couldn't be saved.",
        );
      }

      setConsentState("accepted");
      setConsentOpen(false);
      setHydrating(true);
      const turns = await fetchSessionTurns(sessionId);
      setMessages(turns);
      setHydrating(false);
      completeEntry();
    } catch (consentRequestError) {
      setConsentState("required");
      setConsentError(
        consentRequestError instanceof Error
          ? consentRequestError.message
          : "The agreement couldn't be saved.",
      );
    }
  }

  if (!entered) {
    return (
      <main
        className={`landing ${landingLeaving ? "is-leaving" : ""}`}
        aria-label="Humano-1 introduction"
      >
        <div className="landing-backdrop" aria-hidden="true" />

        <header className="landing-nav">
          <div className="landing-wordmark">
            <span className="brand-mark" aria-hidden="true">
              <span />
            </span>
            <span>
              <strong>Humano</strong>
              <small>Behavior layer · 01</small>
            </span>
          </div>
          <nav aria-label="Homepage">
            <a href="#idea">The idea</a>
            <a href="#features">Features</a>
            <a href="#models">Models</a>
          </nav>
          <button
            className="landing-nav-start"
            type="button"
            onClick={enterHumano}
            disabled={landingLeaving}
          >
            Start
          </button>
        </header>

        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">Conversation, rebuilt</p>
            <h1>
              AI shouldn’t feel like <em>AI.</em>
            </h1>
            <p className="landing-intro">
              Humano is a behavior layer that teaches an existing language
              model when to answer, when to ask, how much to say, and how to
              sound like one consistent mind.
            </p>
            <div className="landing-actions">
              <button
                className="landing-start"
                type="button"
                onClick={enterHumano}
                disabled={landingLeaving}
              >
                <span>Start talking</span>
                <span aria-hidden="true">→</span>
              </button>
              <a href="#idea">See how it works</a>
            </div>
            <div className="landing-proof" aria-label="Humano principles">
              <span>Natural by design</span>
              <span>Memory with restraint</span>
              <span>Honest about being AI</span>
            </div>
          </div>

          <figure className="landing-visual">
            <div className="landing-image-shell">
              <Image
                src="/humano-hero.webp"
                alt="A portrait blending a human face with code and concepts including empathy, memory, creativity, and understanding."
                width={1024}
                height={1536}
                priority
                sizes="(max-width: 760px) 78vw, 36vw"
                unoptimized
              />
            </div>
            <figcaption>
              <span>Human judgment</span>
              <span>Machine intelligence</span>
            </figcaption>
          </figure>

          <Link className="landing-meet-bar" href="/meet-humano-1">
            <span className="landing-meet-index">Field note · 01</span>
            <strong>Meet HUMANO-1</strong>
            <small>
              The idea, the invention, and why intelligence alone wasn’t enough.
            </small>
            <span className="landing-meet-arrow" aria-hidden="true">
              ↗
            </span>
          </Link>
        </section>

        <section className="landing-section landing-idea" id="idea">
          <div className="landing-section-label">
            <span>01</span>
            <p>The idea</p>
          </div>
          <div className="landing-idea-content">
            <h2>Most AI generates an answer. Humano decides what should happen next.</h2>
            <p>
              The language model is only one part of the conversation. Humano
              reads the moment first—your tone, the context, what it remembers,
              and whether a real person would answer or ask one good question.
              Then it shapes, checks, and shortens the reply before you see it.
            </p>
            <div className="landing-flow" aria-label="Humano response process">
              <div>
                <span>01</span>
                <strong>Listen</strong>
                <small>Read the words and the moment.</small>
              </div>
              <div>
                <span>02</span>
                <strong>Judge</strong>
                <small>Choose depth, tone, stance, and timing.</small>
              </div>
              <div>
                <span>03</span>
                <strong>Respond</strong>
                <small>Say the useful thing, naturally.</small>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section landing-features" id="features">
          <div className="landing-section-label">
            <span>02</span>
            <p>What changes</p>
          </div>
          <div className="landing-features-content">
            <div className="landing-section-heading">
              <h2>Built for the parts of conversation benchmarks miss.</h2>
              <p>
                Not more words. Better judgment about which words belong.
              </p>
            </div>
            <div className="landing-feature-grid">
              <article>
                <span>Feeling</span>
                <h3>Emotional awareness</h3>
                <p>
                  It distinguishes excitement from stress, hunger from good
                  news, and confusion from disagreement.
                </p>
              </article>
              <article>
                <span>Memory</span>
                <h3>Quiet continuity</h3>
                <p>
                  Preferences and important facts can carry forward without
                  awkwardly announcing that they were remembered.
                </p>
              </article>
              <article>
                <span>Judgment</span>
                <h3>One question at a time</h3>
                <p>
                  When context genuinely matters, Humano asks the one detail
                  that changes the answer—not an intake form.
                </p>
              </article>
              <article>
                <span>Voice</span>
                <h3>A real point of view</h3>
                <p>
                  It can disagree, make a clear recommendation, and explain
                  its reasoning without turning into a report.
                </p>
              </article>
              <article>
                <span>Depth</span>
                <h3>Enough, then stop</h3>
                <p>
                  Simple moments stay short. Explanations expand only as far as
                  understanding requires.
                </p>
              </article>
              <article>
                <span>Consistency</span>
                <h3>The same mind later</h3>
                <p>
                  The calm, curious personality is reinforced every turn so it
                  doesn’t fade halfway through a conversation.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="landing-models" id="models">
          <div className="landing-models-copy">
            <p className="landing-eyebrow">Choose the pace</p>
            <h2>One behavior layer. Two ways to talk.</h2>
            <p>
              Both modes use the same conversational intelligence, memory, and
              emotional judgment. Pick the depth you want right now.
            </p>
          </div>
          <div className="landing-model-cards">
            <article>
              <span>Flagship</span>
              <h3>Humano-1</h3>
              <p>
                The fullest conversational depth, with an extra quality pass
                when the first answer misses.
              </p>
            </article>
            <article>
              <span>Fast</span>
              <h3>H1</h3>
              <p>
                A lighter, single-pass model for quick everyday conversation.
              </p>
            </article>
          </div>
        </section>

        <section className="landing-final">
          <p>It makes more sense when you talk to it.</p>
          <h2>See if it feels different.</h2>
          <button
            className="landing-start"
            type="button"
            onClick={enterHumano}
            disabled={landingLeaving}
          >
            <span>Start Humano</span>
            <span aria-hidden="true">→</span>
          </button>
          <nav className="landing-policy-links" aria-label="Policies">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/research-preview">Research preview</Link>
          </nav>
        </section>

        {consentOpen ? (
          <div className="consent-scrim">
            <section
              className="consent-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="research-consent-title"
            >
              <button
                className="consent-close"
                type="button"
                onClick={() => setConsentOpen(false)}
                aria-label="Close research preview agreement"
              >
                ×
              </button>
              <p className="consent-kicker">Limited research preview</p>
              <h2 id="research-consent-title">
                Before you talk to Humano
              </h2>
              <p className="consent-intro">
                There are no accounts yet. Your agreement is saved securely in
                this browser for this preview.
              </p>

              <form onSubmit={acceptResearchPreview}>
                <div className="consent-options">
                  <label>
                    <input
                      type="checkbox"
                      checked={consentChecks.ageConfirmed}
                      onChange={(event) =>
                        updateConsentCheck(
                          "ageConfirmed",
                          event.target.checked,
                        )
                      }
                    />
                    <span>I confirm that I am at least 18 years old.</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={consentChecks.unitedStatesConfirmed}
                      onChange={(event) =>
                        updateConsentCheck(
                          "unitedStatesConfirmed",
                          event.target.checked,
                        )
                      }
                    />
                    <span>
                      I am physically located in and reside in the United
                      States.
                    </span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={consentChecks.directConnectionConfirmed}
                      onChange={(event) =>
                        updateConsentCheck(
                          "directConnectionConfirmed",
                          event.target.checked,
                        )
                      }
                    />
                    <span>
                      I am not using a VPN, proxy, Tor, or another service that
                      masks my location.
                    </span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={consentChecks.aiRiskAccepted}
                      onChange={(event) =>
                        updateConsentCheck(
                          "aiRiskAccepted",
                          event.target.checked,
                        )
                      }
                    />
                    <span>
                      I understand Humano is AI, may be confidently wrong, and
                      must not replace professional or emergency help.
                    </span>
                  </label>
                  <label className="consent-critical">
                    <input
                      type="checkbox"
                      checked={consentChecks.disputeTermsAccepted}
                      onChange={(event) =>
                        updateConsentCheck(
                          "disputeTermsAccepted",
                          event.target.checked,
                        )
                      }
                    />
                    <span>
                      I specifically agree to{" "}
                      <strong>binding individual arbitration</strong>, the{" "}
                      <strong>class-action and jury-trial waivers</strong>,
                      assumption of risk, warranty disclaimers, and limits on
                      Humano&apos;s liability described in the{" "}
                      <Link href="/terms#disputes" target="_blank">
                        Terms
                      </Link>
                      .
                    </span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={consentChecks.policiesAccepted}
                      onChange={(event) =>
                        updateConsentCheck(
                          "policiesAccepted",
                          event.target.checked,
                        )
                      }
                    />
                    <span>
                      I agree to the{" "}
                      <Link href="/terms" target="_blank">
                        Terms
                      </Link>
                      ,{" "}
                      <Link href="/privacy" target="_blank">
                        Privacy Policy
                      </Link>
                      , and{" "}
                      <Link href="/research-preview" target="_blank">
                        Research Preview Policy
                      </Link>
                      .
                    </span>
                  </label>

                  {consentError ? (
                    <p className="consent-error" role="alert">
                      {consentError}
                    </p>
                  ) : null}
                </div>

                <button
                  className="consent-submit"
                  type="submit"
                  disabled={
                    !Object.values(consentChecks).every(Boolean) ||
                    consentState === "saving"
                  }
                >
                  {consentState === "saving"
                    ? "Saving agreement…"
                    : "Agree and enter Humano"}
                </button>
              </form>
              <small className="consent-footnote">
                U.S. eligibility and direct-connection access are based on your
                truthful attestation during this limited preview.
              </small>
            </section>
          </div>
        ) : null}
      </main>
    );
  }

  return (
    <main className="humano-app">
      <header className="topbar">
        <button
          className="brand"
          type="button"
          onClick={() => void startFresh()}
          aria-label="Start a new Humano conversation"
        >
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span className="brand-copy">
            <strong>Humano</strong>
            <small>conversation layer · 01</small>
          </span>
        </button>

        <div
          className="model-selector"
          role="radiogroup"
          aria-label="Humano model"
        >
          <button
            type="button"
            role="radio"
            aria-checked={modelVariant === "humano-1"}
            className={modelVariant === "humano-1" ? "is-selected" : ""}
            onClick={() => selectModelVariant("humano-1")}
            disabled={sending}
            title="Flagship model with the fullest conversational depth"
          >
            <strong>Humano-1</strong>
            <small>Flagship</small>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={modelVariant === "h1"}
            className={modelVariant === "h1" ? "is-selected" : ""}
            onClick={() => selectModelVariant("h1")}
            disabled={sending}
            title="Faster model for lighter conversations"
          >
            <strong>H1</strong>
            <small>Fast</small>
          </button>
        </div>

        <nav className="topbar-actions" aria-label="Conversation controls">
          <button
            className="quiet-button"
            type="button"
            onClick={() => void startFresh()}
            disabled={sending}
          >
            <span aria-hidden="true">＋</span>
            New conversation
          </button>
          <button
            className={`quiet-button ${dataOpen ? "is-active" : ""}`}
            type="button"
            onClick={() => {
              setDataError("");
              setDataScreen("overview");
              setDataOpen(true);
            }}
            disabled={sending}
          >
            <span aria-hidden="true">◌</span>
            Data
          </button>
        </nav>
      </header>

      {dataOpen ? (
        <div
          className="data-scrim"
          onMouseDown={() => !deletingData && setDataOpen(false)}
        >
          <section
            className="data-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="data-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="consent-close"
              type="button"
              onClick={() => setDataOpen(false)}
              disabled={deletingData}
              aria-label="Close data controls"
            >
              ×
            </button>
            {dataScreen === "overview" ? (
              <>
                <p className="consent-kicker">Your data · 1 of 2</p>
                <h2 id="data-dialog-title">Start clean.</h2>
                <p className="data-dialog-copy">
                  Deleting data permanently removes your chats, remembered
                  details, feedback, model choice, and this browser&apos;s preview
                  access. It does not affect anyone else&apos;s Humano.
                </p>
                <p className="data-dialog-note">
                  You&apos;ll return to the main menu afterward. To use Humano
                  again, you&apos;ll need to review and accept the research-preview
                  requirements and Terms again.
                </p>
                <button
                  className="data-continue"
                  type="button"
                  onClick={() => setDataScreen("confirm")}
                >
                  Continue
                </button>
              </>
            ) : (
              <>
                <p className="consent-kicker">Your data · 2 of 2</p>
                <h2 id="data-dialog-title">Delete it all?</h2>
                <p className="data-dialog-copy">
                  This can&apos;t be undone. Once deleted, Humano won&apos;t remember
                  past conversations or preferences from this browser.
                </p>
                {dataError ? (
                  <p className="consent-error" role="alert">
                    {dataError}
                  </p>
                ) : null}
                <div className="data-actions">
                  <button
                    className="data-cancel"
                    type="button"
                    onClick={() => setDataScreen("overview")}
                    disabled={deletingData}
                  >
                    Go back
                  </button>
                  <button
                    className="data-delete"
                    type="button"
                    onClick={() => void deleteAllData()}
                    disabled={deletingData}
                  >
                    {deletingData ? "Deleting your data…" : "Delete all data"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}

      <section
        className={`conversation-stage ${hasConversation ? "has-conversation" : ""}`}
      >
        <div className="conversation-column">
          {!hasConversation && !hydrating ? (
            <div className="opening">
              <p className="eyebrow">A quieter kind of AI</p>
              <h1>Say it how it is.</h1>
              <p className="opening-copy">
                Humano pays attention to the point, the tone, and when less is
                more.
              </p>
              <div className="opening-rule" aria-hidden="true">
                <span />
              </div>
            </div>
          ) : null}

          {hasConversation ? (
            <div
              className="messages"
              aria-live="polite"
              aria-label="Conversation"
            >
              {messages.map((message) => (
                <article
                  className={`message message--${message.role}`}
                  key={message.id}
                >
                  <div className="message-meta">
                    {message.role === "assistant" ? "Humano" : "You"}
                  </div>
                  <div className="message-content">
                    {renderText(message.content)}
                  </div>
                  {message.role === "assistant" ? (
                    <div
                      className="response-feedback"
                      aria-label="Rate this response"
                    >
                      <button
                        type="button"
                        className={
                          message.feedback === "positive" ? "selected" : ""
                        }
                        onClick={() =>
                          void sendFeedback(message.id, "positive")
                        }
                        aria-label="This response felt right"
                        aria-pressed={message.feedback === "positive"}
                      >
                        {message.feedback === "positive"
                          ? "Felt right · saved"
                          : "Felt right"}
                      </button>
                      <button
                        type="button"
                        className={
                          message.feedback === "negative" ? "selected" : ""
                        }
                        onClick={() =>
                          void sendFeedback(message.id, "negative")
                        }
                        aria-label="This response missed the mark"
                        aria-pressed={message.feedback === "negative"}
                      >
                        {message.feedback === "negative"
                          ? "Missed it · saved"
                          : "Missed it"}
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
              {sending ? (
                <article className="message message--assistant is-thinking">
                  <div className="message-meta">Humano</div>
                  <div className="thinking-dots" aria-label="Humano is thinking">
                    <span />
                    <span />
                    <span />
                  </div>
                </article>
              ) : null}
              <div ref={conversationEndRef} />
            </div>
          ) : null}

          <div
            className={`composer-zone ${hasConversation ? "composer-zone--docked" : ""}`}
          >
            {memoryNotice ? (
              <div className="memory-notice" role="status">
                {memoryNotice}
              </div>
            ) : null}
            {error ? (
              <div className="error-note" role="alert">
                <span>{error}</span>
                <button type="button" onClick={() => setError("")}>
                  Dismiss
                </button>
              </div>
            ) : null}
            <form
              className={`composer ${activeMode === "debate" ? "composer--debate" : ""}`}
              onSubmit={submitMessage}
            >
              {commandMenuOpen ? (
                <div
                  className="slash-menu"
                  id="slash-command-menu"
                  role="listbox"
                  aria-label="Conversation modes"
                >
                  <p>Modes</p>
                  {visibleCommands.map((command, index) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={selectedCommandIndex === index}
                      className={
                        selectedCommandIndex === index ? "is-selected" : ""
                      }
                      key={command.id}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => activateMode(command.id)}
                    >
                      <span className="slash-command-mark" aria-hidden="true">
                        ↯
                      </span>
                      <span>
                        <strong>{command.label}</strong>
                        <small>{command.description}</small>
                      </span>
                      <kbd>{command.command}</kbd>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="composer-heading">
                <label htmlFor="humano-message">
                  {hasConversation ? "Keep going" : "What's on your mind?"}
                </label>
                {activeMode === "debate" ? (
                  <button
                    className="mode-chip"
                    type="button"
                    onClick={() => activateMode("standard")}
                    aria-label="Turn off debate mode"
                  >
                    <span aria-hidden="true">↯</span>
                    Debate
                    <span aria-hidden="true">×</span>
                  </button>
                ) : null}
              </div>
              <div className="composer-row">
                <textarea
                  ref={textareaRef}
                  id="humano-message"
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setSelectedCommandIndex(0);
                    setCommandMenuDismissed(false);
                  }}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={
                    health === "needs_configuration"
                      ? "Temporarily unavailable"
                      : activeMode === "debate"
                        ? "Make your case…"
                        : "Write naturally…"
                  }
                  rows={1}
                  disabled={health !== "ready" || hydrating}
                  aria-controls={commandMenuOpen ? "slash-command-menu" : undefined}
                />
                <button
                  className="send-button"
                  type="submit"
                  disabled={!canSend}
                  aria-label="Send message"
                >
                  <span aria-hidden="true">↑</span>
                </button>
              </div>
            </form>
            <p className="composer-disclosure" role="note">
              <strong>Humano is AI, not a person.</strong> Don&apos;t use it for
              important decisions or emergencies.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function getOrCreateId(key: string): string {
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

async function fetchSessionTurns(
  sessionId: string,
): Promise<ConversationMessage[]> {
  if (!sessionId) return [];
  const response = await fetch(
    `/api/session?sessionId=${encodeURIComponent(sessionId)}`,
    { cache: "no-store" },
  );
  if (!response.ok) return [];
  const body = (await response.json()) as {
    turns?: ConversationMessage[];
  };
  return body.turns ?? [];
}

function renderText(content: string) {
  return content.split(/\n{2,}/u).map((paragraph, index) => (
    <p key={`${index}-${paragraph.slice(0, 12)}`}>
      {paragraph.split("\n").map((line, lineIndex) => (
        <span key={`${lineIndex}-${line.slice(0, 10)}`}>
          {line}
          {lineIndex < paragraph.split("\n").length - 1 ? <br /> : null}
        </span>
      ))}
    </p>
  ));
}
