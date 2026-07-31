import type { HumanoConfig } from "../../config/schema";
import type { ConversationPlan, FilterResult } from "../../domain/types";
import type { NaturalnessFilter } from "../../ports/contracts";
import { cleanStockHumanoVoice } from "../../core/humano-voice-policy";

/** Removes hidden reasoning and low-risk boilerplate without changing meaning. */
export class DeterministicNaturalnessFilter implements NaturalnessFilter {
  constructor(private readonly config: HumanoConfig["naturalness"]) {}

  async process(
    rawContent: string,
    plan: ConversationPlan,
    modelVariant: Parameters<NaturalnessFilter["process"]>[2] = "humano-1",
  ): Promise<FilterResult> {
    void plan;
    let content = rawContent.trim();
    const changes: string[] = [];

    if (this.config.stripReasoningTags) {
      const stripped = content
        .replace(/<think>[\s\S]*?<\/think>/giu, "")
        .replace(/<think>[\s\S]*$/giu, "")
        .trim();
      if (stripped !== content) changes.push("removed_hidden_reasoning");
      content = stripped;
    }

    for (const opener of this.config.replaceableOpeners) {
      if (content.toLocaleLowerCase().startsWith(opener.toLocaleLowerCase())) {
        content = content.slice(opener.length).trimStart();
        if (content) {
          content = content[0]?.toLocaleUpperCase() + content.slice(1);
        }
        changes.push("removed_canned_opener");
        break;
      }
    }

    if (modelVariant === "humano-1") {
      const voiceCleaned = cleanStockHumanoVoice(content);
      if (voiceCleaned.changes.length > 0) {
        content = voiceCleaned.content;
        changes.push(...voiceCleaned.changes);
      }
    }

    if (
      plan.stance.mode === "considered_opinion" ||
      plan.stance.mode === "advocacy_debate" ||
      plan.stance.mode === "adversarial_debate"
    ) {
      for (const rule of this.config.registerReplacements) {
        const escapedPattern = rule.pattern.replace(
          /[.*+?^${}()|[\]\\]/gu,
          "\\$&",
        );
        const rewritten = content.replace(
          new RegExp(escapedPattern, "giu"),
          rule.replacement,
        );
        if (rewritten !== content) {
          changes.push("simplified_analyst_register");
          content = rewritten;
        }
      }
    }

    let sentenceParts =
      content.match(/[^.!?]+[.!?]+|[^.!?]+$/gu)?.map((part) => part.trim()) ??
      [];
    const trailingSentence = sentenceParts.at(-1)?.toLocaleLowerCase() ?? "";
    const serviceOffer =
      this.config.serviceOfferPatterns.some((pattern) =>
        trailingSentence.includes(pattern.toLocaleLowerCase()),
      );
    if (serviceOffer) {
      sentenceParts.pop();
      content = sentenceParts.join(" ").trim();
      changes.push("removed_assistant_service_offer");
    }
    if (
      !serviceOffer &&
      content &&
      plan.question.mode === "none" &&
      sentenceParts.length > 1 &&
      this.config.trailingOfferPatterns.some((pattern) =>
        trailingSentence.startsWith(pattern.toLocaleLowerCase()),
      )
    ) {
      sentenceParts.pop();
      content = sentenceParts.join(" ").trim();
      changes.push("removed_unneeded_trailing_offer");
    }
    sentenceParts =
      content.match(/[^.!?]+[.!?]+|[^.!?]+$/gu)?.map((part) => part.trim()) ??
      [];

    if (
      plan.stance.mode === "considered_opinion" &&
      sentenceParts.length > plan.length.maxSentences
    ) {
      content = sentenceParts
        .slice(0, plan.length.maxSentences)
        .join(" ")
        .trim();
      changes.push("trimmed_unrequested_opinion_rant");
    }

    const punctuationPattern = /([!?])\1+/gu;
    const normalizedPunctuation = content.replace(
      punctuationPattern,
      "$1".repeat(this.config.maxRepeatedPunctuation),
    );
    if (normalizedPunctuation !== content) {
      changes.push("normalized_repeated_punctuation");
      content = normalizedPunctuation;
    }

    const normalizedWhitespace = content
      .replace(/[ \t]+\n/gu, "\n")
      .replace(/\n{3,}/gu, "\n\n")
      .replace(/[ \t]{2,}/gu, " ")
      .trim();
    if (normalizedWhitespace !== content) {
      changes.push("normalized_whitespace");
      content = normalizedWhitespace;
    }

    return { content, changes: [...new Set(changes)] };
  }
}
