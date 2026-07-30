import { loadHumanoConfig } from "../config/load-config";
import { CharacterTokenEstimator, CryptoIdGenerator, SystemClock } from "../core/runtime";
import { HumanoConversationEngine } from "../application/humano-conversation-engine";
import { SlidingWindowRateLimiter } from "../application/sliding-window-rate-limiter";
import { OpenRouterProvider } from "../adapters/model/openrouter-provider";
import { JsonObservabilitySink } from "../adapters/observability/json-observability-sink";
import { HumanoD1Repository } from "../adapters/persistence/humano-d1-repository";
import { InMemoryRepository } from "../adapters/persistence/in-memory-repository";
import { HeuristicEmotionEngine } from "../engines/emotion/heuristic-emotion-engine";
import { ConfigurableHumanStateEngine } from "../engines/state/configurable-human-state-engine";
import { AdaptiveConversationalDepthEngine } from "../engines/depth/adaptive-conversational-depth-engine";
import { ConfigurableAdviceReadinessEngine } from "../engines/advice/configurable-advice-readiness-engine";
import { DeterministicAdviceStyleFilter } from "../engines/advice/deterministic-advice-style-filter";
import { LexicalMemoryEngine } from "../engines/memory/lexical-memory-engine";
import { DeterministicNaturalnessFilter } from "../engines/naturalness/deterministic-naturalness-filter";
import { ConfiguredPersonalityEngine } from "../engines/personality/configured-personality-engine";
import { RuleConversationPlanner } from "../engines/planner/rule-conversation-planner";
import { ContextWindowManager } from "../engines/prompt/context-window-manager";
import { HumanoPromptComposer } from "../engines/prompt/humano-prompt-composer";
import { RuleResponseValidator } from "../engines/validator/rule-response-validator";

type RuntimeRepository = HumanoD1Repository | InMemoryRepository;

export interface HumanoRuntime {
  engine: HumanoConversationEngine;
  rateLimiter: SlidingWindowRateLimiter;
  config: ReturnType<typeof loadHumanoConfig>;
  repository: RuntimeRepository;
}

let runtime: HumanoRuntime | undefined;

/** The sole composition root for infrastructure and behavioral modules. */
export function getHumanoRuntime(): HumanoRuntime {
  if (runtime) return runtime;

  const config = loadHumanoConfig();
  const apiKey = process.env.OPENROUTER_API_KEY ?? "";
  // Vercel has no Cloudflare D1 binding. This adapter keeps the preview fully
  // runnable without an external database; state is intentionally ephemeral.
  const repository: RuntimeRepository = new InMemoryRepository();
  const ids = new CryptoIdGenerator();
  const clock = new SystemClock();
  const tokens = new CharacterTokenEstimator(
    config.conversation.estimatedCharsPerToken,
  );
  const contextWindow = new ContextWindowManager(tokens, config.conversation);

  runtime = {
    config,
    repository,
    rateLimiter: new SlidingWindowRateLimiter(
      config.security.requestsPerWindow,
      config.security.rateLimitWindowMs,
    ),
    engine: new HumanoConversationEngine({
      config,
      conversations: repository,
      memoryRepository: repository,
      trainingEvents: repository,
      subjectData: repository,
      memory: new LexicalMemoryEngine(repository, ids, config.memory),
      emotions: new HeuristicEmotionEngine(config.emotion),
      personality: new ConfiguredPersonalityEngine(config.personality),
      planner: new RuleConversationPlanner(
        config.planner,
        new AdaptiveConversationalDepthEngine(config.planner.depth),
        new ConfigurableAdviceReadinessEngine(config.planner.advice),
        new ConfigurableHumanStateEngine(config.planner.humanState),
      ),
      prompts: new HumanoPromptComposer(contextWindow, config, clock),
      model: new OpenRouterProvider(apiKey, config.provider),
      naturalness: new DeterministicNaturalnessFilter(config.naturalness),
      adviceStyle: new DeterministicAdviceStyleFilter(config.adviceStyle),
      validator: new RuleResponseValidator(
        config.naturalness,
        config.validator,
        config.planner,
        config.modes.debate,
      ),
      clock,
      ids,
      tokens,
      observability: new JsonObservabilitySink(config.observability),
    }),
  };
  return runtime;
}

export function runtimeHealth() {
  return {
    // The Vercel preview intentionally uses the in-memory repository, so an
    // external database is not a prerequisite for a working chat session.
    databaseConfigured: true,
    keyConfigured: Boolean(process.env.OPENROUTER_API_KEY),
  };
}
