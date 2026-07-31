import type { HumanoConfig } from "../../config/schema";
import type {
  ConversationTurn,
  ModelMessage,
  TurnId,
} from "../../domain/types";
import type { TokenEstimator } from "../../ports/contracts";

/** Trims oldest conversational turns while always preserving the current input. */
export class ContextWindowManager {
  constructor(
    private readonly estimator: TokenEstimator,
    private readonly config: HumanoConfig["conversation"],
  ) {}

  fit(
    systemPrompt: string,
    history: ConversationTurn[],
    userText: string,
    maxOutputTokens: number,
  ): {
    historyMessages: ModelMessage[];
    includedTurnIds: TurnId[];
    estimatedInputTokens: number;
  } {
    const available =
      this.config.contextWindowTokens -
      this.config.contextReserveTokens -
      maxOutputTokens;
    const boundedHistory = history.slice(-this.config.maxHistoryTurns);
    let used =
      this.estimator.estimate(systemPrompt) + this.estimator.estimate(userText);
    const included: ConversationTurn[] = [];

    for (let index = boundedHistory.length - 1; index >= 0; index -= 1) {
      const turn = boundedHistory[index];
      if (!turn) continue;
      const cost = turn.estimatedTokens + 4;
      if (used + cost > available) break;
      included.unshift(turn);
      used += cost;
    }

    return {
      historyMessages: included.map((turn) => ({
        role: turn.role,
        content: turn.content,
      })),
      includedTurnIds: included.map((turn) => turn.id),
      estimatedInputTokens: used,
    };
  }
}
