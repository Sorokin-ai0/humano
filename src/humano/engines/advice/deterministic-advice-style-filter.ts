import type { HumanoConfig } from "../../config/schema";
import type { ConversationPlan, FilterResult } from "../../domain/types";
import type { AdviceStyleFilter } from "../../ports/contracts";

interface CompiledRule {
  expression: RegExp;
  replacement: string;
  changeTag: string;
}

const fencedCodePattern = /(```[\s\S]*?(?:```|$))/gu;

/**
 * Softens sentence-initial directives after candidate selection. It only runs
 * for considered opinions and never alters fenced code blocks.
 */
export class DeterministicAdviceStyleFilter implements AdviceStyleFilter {
  private readonly rules: CompiledRule[];

  constructor(private readonly config: HumanoConfig["adviceStyle"]) {
    this.rules = config.rules.map((rule) => ({
      expression: new RegExp(rule.pattern, rule.flags),
      replacement: rule.replacement,
      changeTag: rule.changeTag,
    }));
  }

  async process(
    content: string,
    plan: ConversationPlan,
  ): Promise<FilterResult> {
    if (!this.config.enabled || plan.advice.mode !== "considered_opinion") {
      return { content, changes: [] };
    }

    const changes: string[] = [];
    const segments = content.split(fencedCodePattern);
    const rewritten = segments
      .map((segment, index) => {
        if (index % 2 === 1) return segment;

        let prose = segment;
        for (const rule of this.rules) {
          rule.expression.lastIndex = 0;
          const next = prose.replace(rule.expression, rule.replacement);
          if (next !== prose) changes.push(rule.changeTag);
          prose = next;
        }
        prose = this.limitRecommendationDetail(prose, plan, changes);
        return prose;
      })
      .join("");

    return {
      content: rewritten,
      changes: [...new Set(changes)],
    };
  }

  private limitRecommendationDetail(
    content: string,
    plan: ConversationPlan,
    changes: string[],
  ): string {
    const limit = this.config.recommendation;
    if (
      !limit.enabled ||
      plan.depth?.taskKind !== "recommendation" ||
      plan.advice.domain !== "general"
    ) {
      return content;
    }
    const sentences =
      content.match(/[^.!?]+[.!?]+|[^.!?]+$/gu)?.map((sentence) =>
        sentence.trim(),
      ) ?? [];
    if (sentences.length <= limit.maxSentences) return content;
    changes.push(limit.changeTag);
    return sentences.slice(0, limit.maxSentences).join(" ");
  }
}
