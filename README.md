# Humano-1

Humano-1 is a modular AI behavior layer for natural conversation. It is not a
foundation model and it does not pretend to be human. It plans conversational
judgment before generation, then filters and validates the answer before the
user sees it.

The current runtime uses `qwen/qwen3-8b` through OpenRouter. The model
credential stays on the server; the browser never receives it.

Two selectable generation profiles share the same Humano behavior layer:

- **Humano-1** uses Qwen3 8B and allows one bounded quality revision.
- **H1** uses Qwen3.7 Flash, a smaller response budget, and one generation pass for
  lower latency.

## Development

Requirements: Node.js 22.13 or newer.

```bash
npm install
cp .env.example .env.local
# Put your OpenRouter key in .env.local
npm run dev
```

```bash
npm run typecheck
npm run lint
npm test
```

The opt-in live model test spends a small amount of OpenRouter credit:

```bash
RUN_LIVE_MODEL_TESTS=1 npm run test:live
```

## Deployment

Humano currently deploys as a Cloudflare Worker and uses a Cloudflare D1
binding named `DB` for conversation state, memory, feedback, preview consent,
and training metadata. Configure `OPENROUTER_API_KEY` as a server-side secret;
never expose it to the browser.

`npm run build` produces the Worker-compatible production bundle used by the
current runtime. Vercel deployment requires a deliberate adapter for the
Cloudflare Worker APIs and D1 persistence (for example, Vercel Postgres or
another supported database); it is not enabled by a placeholder configuration
that would silently break the application.

## What happens on every turn

```mermaid
flowchart LR
  User["User message"] --> Session["Conversation context"]
  Session --> Parallel["Memory retrieval + emotion detection"]
  Parallel --> Advice["Advice readiness engine"]
  Advice --> Depth["Adaptive depth engine"]
  Depth --> Planner["Conversation planner"]
  Planner --> Prompt["Prompt composer"]
  Prompt --> Model["Provider-neutral model port"]
  Model --> Filter["Naturalness filter"]
  Filter --> Validator["Response validator"]
  Validator -->|selected candidate| AdviceStyle["Advice style pass"]
  AdviceStyle --> Response["Final response"]
  Validator -->|one bounded revision| Model
  Response --> Persist["Conversation, memory, metrics, training event"]
```

The advice engine first decides whether an advice turn needs context, is ready
for a considered opinion, or needs urgent direct guidance. The depth engine
then classifies the conversational task and emits explicit coverage obligations
such as definition, mechanism, example, rationale, tradeoff, or next action.
The planner turns those decisions into a response budget, question policy,
empathy, stance, uncertainty, format, and memory use. The model does not make
those judgments implicitly.

Advice continuation is reconstructed from recent user turns only. A context
reply can complete an earlier request, while an unrelated user topic resets the
advice chain. If both generated candidates ignore a required clarification, a
domain-specific one-question recovery is used instead of generic advice.

## Architecture

All behavioral modules depend on typed ports, not concrete implementations.
`src/humano/bootstrap/create-humano-runtime.ts` is the only composition root.

| Module | Responsibility | Current implementation |
| --- | --- | --- |
| Conversation engine | Stage order, sessions, turn serialization, persistence | `HumanoConversationEngine` |
| Context manager | Token estimation and oldest-first trimming | `ContextWindowManager` |
| Memory engine | Explicit fact extraction, salience, decay, retrieval | `LexicalMemoryEngine` |
| Emotion engine | Independent probabilities for eight signals | `HeuristicEmotionEngine` |
| Advice readiness engine | Advice detection, domain, context sufficiency, and response act | `ConfigurableAdviceReadinessEngine` |
| Conversational depth engine | Task classification, sufficiency obligations, adaptive response budget | `AdaptiveConversationalDepthEngine` |
| Personality engine | Stable personality snapshot | `ConfiguredPersonalityEngine` |
| Conversation planner | Depth budget, stance, empathy, questions, memory, tone | `RuleConversationPlanner` |
| Prompt composer | Identity, personality, plan, untrusted memory, history | `HumanoPromptComposer` |
| Model provider | Provider-neutral generation contract | `OpenRouterProvider` |
| Naturalness filter | Reasoning removal and safe surface cleanup | `DeterministicNaturalnessFilter` |
| Advice style filter | Configurable sentence-level softening for considered opinions | `DeterministicAdviceStyleFilter` |
| Response validator | Naturalness, readiness, considered-opinion fit, answer sufficiency, bias, length, emotion, memory, repetition | `RuleResponseValidator` |
| Persistence | Conversations, memories, feedback, training traces | `HumanoD1Repository` |
| Observability | Content-free structured turn events | `JsonObservabilitySink` |

`LanguageModelProvider` contains no OpenRouter fields. Ollama, vLLM, local GGUF,
Groq, Together, or Fireworks adapters can implement the same port and be
selected only in the composition root.

## Persistence and memory

Cloudflare D1 stores conversation state and memory. Runtime initialization
creates the required tables, while the checked-in Drizzle migration is the
source-controlled schema.

Humano distinguishes:

- Short-term memory and conversation history: recent ordered turns.
- Long-term memory: explicit reusable statements.
- User profile: explicit name, work, location, or timezone statements.
- Important facts: statements introduced with “remember that” or equivalent.
- Preferences: explicit likes, dislikes, and response-style preferences.
- Goals: explicit ongoing goals.

Momentary emotions, guesses, assistant claims, credentials, keys, passwords, and
tokens are not written to long-term memory. Retrieved memory is included as
untrusted data and is never promoted into system instructions.

Starting a new conversation clears the session while keeping reusable
preferences. “Clear conversation and memory” removes both.

## Configuration

Behavioral thresholds, task and advice-domain patterns, advice context
dimensions, clarification instructions and recoveries, coverage obligations,
depth budgets, lexicons, phrases, sampling, memory weights, validator weights,
generation profiles, privacy settings, and rate limits live in
`config/humano.config.json`. The file is runtime-validated with Zod before the
application starts.

The OpenRouter request explicitly disables Qwen reasoning for normal dialogue.
Hidden reasoning fields are ignored by the provider adapter and `<think>` blocks
are removed again by the naturalness layer before persistence or display.

## Observability and training readiness

Structured logs contain latency, token usage, provider/model, planner decisions,
memory counts, and validator scores. They do not contain message text or
credentials.

Each completed turn also writes a versioned training event with:

- emotion probabilities and fixed signal tags;
- retrieved and selected memory IDs plus ranking scores;
- the declarative conversation plan;
- the adaptive depth task, signals, obligations, and algorithm version;
- advice domain, readiness mode, missing context, continuation signals, and
  advice algorithm version;
- advice style algorithm version and any deterministic recovery changes;
- provider, model, latency, finish reason, and token use;
- filter changes and validator metrics;
- selected/rejected candidate provenance;
- privacy and schema versions.

Raw prompt and response content is disabled in training events by default. User
feedback is stored separately so Humano-1.5 can later create planner,
supervised-response, and preference datasets without redesigning the runtime.
Hidden chain-of-thought is never stored.

## Privacy boundary

Message content is sent to OpenRouter and its selected Qwen endpoint.
Conversation memory and training metadata stay in the configured D1 database.
Review
`provider.dataCollection` in the configuration if you change providers.

The API key belongs only in `.env.local`, which is ignored by Git. Do not use a
`NEXT_PUBLIC_` or `VITE_` prefix. Rotate any key that has been shared in a chat,
terminal recording, or other external channel.

## Test strategy

The deterministic suite covers emotion overlap, adaptive depth classification,
advice readiness and multi-turn context, answer sufficiency and expansion,
planner brevity and anti-sycophancy, memory extraction and secret rejection,
reasoning removal, identity transparency, provider request mapping, persistence
ordering, and the full orchestrated turn.
The build-level test verifies the production artifact and social preview and
checks that the client source contains no credential path. The release surface
is also exercised through end-to-end validation.

Live evaluation is opt-in so ordinary test runs never spend model credit.
