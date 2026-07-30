import { env } from "cloudflare:workers";
import { loadHumanoConfig } from "../config/load-config";
import { CharacterTokenEstimator, CryptoIdGenerator, SystemClock } from "../core/runtime";
import { HumanoConversationEngine } from "../application/humano-conversation-engine";
import { SlidingWindowRateLimiter } from "../application/sliding-window-rate-limiter";
import { OpenRouterProvider } from "../adapters/model/openrouter-provider";
import { JsonObservabilitySink } from "../adapters/observability/json-observability-sink";
import { HumanoD1Repository } from "../adapters/persistence/humano-d1-repository";
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

interface RuntimeEnvironment {
  DB?: D1Database;
  OPENROUTER_API_KEY?: string;
}

export interface HumanoRuntime {
  engine: HumanoConversationEngine;
  rateLimiter: SlidingWindowRateLimiter;
  config: ReturnType<typeof loadHumanoConfig>;
  repository: HumanoD1Repository;
}

let runtime: HumanoRuntime | undefined;

/** The sole composition root for infrastructure and behavioral modules. */
export function getHumanoRuntime(): HumanoRuntime {
  if (runtime) return runtime;

  const config = loadHumanoConfig();
  const runtimeEnvironment = env as unknown as RuntimeEnvironment;
  if (!runtimeEnvironment.DB) {
    throw new Error("The Humano D1 database binding is unavailable.");
  }
  const apiKey =
    runtimeEnvironment.OPENROUTER_API_KEY ??
    process.env.OPENROUTER_API_KEY ??
    "";
  const repository = new HumanoD1Repository(runtimeEnvironment.DB);
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
  const runtimeEnvironment = env as unknown as RuntimeEnvironment;
  return {
    databaseConfigured: Boolean(runtimeEnvironment.DB),
    keyConfigured: Boolean(
      runtimeEnvironment.OPENROUTER_API_KEY ??
        process.env.OPENROUTER_API_KEY,
    ),
  };
}
