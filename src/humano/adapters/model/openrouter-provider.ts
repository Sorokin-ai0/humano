import type { HumanoConfig } from "../../config/schema";
import type {
  GenerationRequest,
  GenerationResult,
} from "../../domain/types";
import type { LanguageModelProvider } from "../../ports/contracts";

interface OpenRouterResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning?: string | null;
      reasoning_details?: unknown[];
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
  error?: {
    code?: number | string;
    message?: string;
  };
}

export class ModelProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ModelProviderError";
  }
}

/** OpenRouter-specific HTTP mapping. Provider fields never enter business code. */
export class OpenRouterProvider implements LanguageModelProvider {
  readonly name = "openrouter";
  readonly model: string;

  constructor(
    private readonly apiKey: string,
    private readonly config: HumanoConfig["provider"],
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.model = config.models["humano-1"];
    if (!apiKey.trim()) {
      throw new Error("OPENROUTER_API_KEY is required.");
    }
  }

  async generate(
    request: GenerationRequest,
    externalSignal?: AbortSignal,
  ): Promise<GenerationResult> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        return await this.execute(request, externalSignal);
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof ModelProviderError && error.retryable;
        if (!retryable || attempt >= this.config.maxRetries) throw error;
        await this.delay(this.retryDelayMs(error, attempt));
      }
    }
    throw lastError;
  }

  private async execute(
    request: GenerationRequest,
    externalSignal?: AbortSignal,
  ): Promise<GenerationResult> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort("model_timeout"),
      this.config.timeoutMs,
    );
    const abortListener = () => controller.abort(externalSignal?.reason);
    externalSignal?.addEventListener("abort", abortListener, { once: true });
    const startedAt = Date.now();
    const requestedModel = this.config.models[request.modelVariant];

    try {
      const response = await this.fetcher(
        `${this.config.baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            "X-OpenRouter-Title": this.config.appName,
          },
          body: JSON.stringify({
            model: requestedModel,
            messages: request.messages,
            stream: false,
            max_tokens: request.maxOutputTokens,
            temperature: request.temperature,
            top_p: request.topP,
            top_k: request.topK,
            frequency_penalty: request.frequencyPenalty,
            presence_penalty: request.presencePenalty,
            reasoning: { enabled: false },
            provider: {
              data_collection: this.config.dataCollection,
            },
            ...(this.config.sendPseudonymousUserId &&
            request.pseudonymousUserId
              ? { user: request.pseudonymousUserId }
              : {}),
          }),
          signal: controller.signal,
        },
      );
      const payload = (await response
        .json()
        .catch(() => ({}))) as OpenRouterResponse;
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        throw new ModelProviderError(
          this.safeErrorMessage(payload, response.status),
          response.status,
          retryable,
          this.retryAfterMs(response.headers.get("Retry-After")),
        );
      }
      if (payload.error) {
        throw new ModelProviderError(
          this.safeErrorMessage(payload, 502),
          502,
          false,
        );
      }

      const choice = payload.choices?.[0];
      const content = choice?.message?.content?.trim() ?? "";
      if (!content) {
        throw new ModelProviderError(
          "The model returned an empty response.",
          502,
          true,
        );
      }
      const usage = payload.usage;
      return {
        content,
        provider: this.name,
        model: payload.model ?? requestedModel,
        finishReason: choice?.finish_reason ?? null,
        usage: {
          promptTokens: usage?.prompt_tokens ?? 0,
          completionTokens: usage?.completion_tokens ?? 0,
          totalTokens: usage?.total_tokens ?? 0,
          ...(typeof usage?.cost === "number" ? { costUsd: usage.cost } : {}),
        },
        latencyMs: Date.now() - startedAt,
        generationId:
          response.headers.get("X-Generation-Id") ?? payload.id ?? undefined,
      };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ModelProviderError(
          "The model took too long to respond.",
          504,
          true,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortListener);
    }
  }

  private safeErrorMessage(
    _payload: OpenRouterResponse,
    status: number,
  ): string {
    if (status === 401 || status === 403) {
      return "The conversation service is temporarily unavailable.";
    }
    if (status === 429) {
      return "The conversation service is busy right now. Try again shortly.";
    }
    return "The conversation service could not complete the request.";
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  private retryDelayMs(error: unknown, attempt: number): number {
    const exponentialDelay =
      this.config.retryBaseDelayMs * 2 ** attempt;
    const retryAfterDelay =
      error instanceof ModelProviderError ? (error.retryAfterMs ?? 0) : 0;
    return Math.min(
      this.config.retryMaxDelayMs,
      Math.max(exponentialDelay, retryAfterDelay),
    );
  }

  private retryAfterMs(value: string | null): number | undefined {
    if (!value) return undefined;
    if (/^\d+$/u.test(value.trim())) {
      return Number(value.trim()) * 1000;
    }
    const retryAt = Date.parse(value);
    if (Number.isNaN(retryAt)) return undefined;
    return Math.max(0, retryAt - Date.now());
  }
}
