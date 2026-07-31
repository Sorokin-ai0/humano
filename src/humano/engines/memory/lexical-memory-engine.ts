import type { HumanoConfig } from "../../config/schema";
import type {
  MemoryId,
  MemoryKind,
  RetrievedMemory,
  StoredMemory,
  SubjectId,
  TurnId,
} from "../../domain/types";
import type {
  IdGenerator,
  MemoryEngine,
  MemoryRepository,
} from "../../ports/contracts";
import {
  exponentialRecency,
  includesAny,
  lexicalOverlap,
  normalizeText,
  roundScore,
  stripQuotedAndCode,
} from "../../core/text";

/** Retrieves and extracts explicit, reusable facts without another model call. */
export class LexicalMemoryEngine implements MemoryEngine {
  constructor(
    private readonly repository: MemoryRepository,
    private readonly ids: IdGenerator,
    private readonly config: HumanoConfig["memory"],
  ) {}

  async retrieve(
    subjectId: SubjectId,
    query: string,
  ): Promise<RetrievedMemory[]> {
    const candidates = await this.repository.listForSubject(
      subjectId,
      this.config.retrievalCandidateLimit,
    );
    const now = new Date();

    const ranked = candidates
      .map((memory) => {
        const overlap = lexicalOverlap(query, memory.content);
        const recency = exponentialRecency(
          memory.updatedAt,
          now,
          this.config.halfLifeDays[memory.kind],
        );
        const typeFit = this.typeFit(query, memory.kind, memory.content);
        const continuity = memory.accessCount > 0 ? 0.8 : 0.35;
        const score =
          overlap * this.config.weights.lexicalOverlap +
          recency * this.config.weights.recency +
          memory.salience * this.config.weights.importance +
          typeFit * this.config.weights.typeFit +
          continuity * this.config.weights.continuity;

        return {
          memory,
          score: roundScore(score),
          signals: [
            overlap > 0 ? "lexical-overlap" : "",
            recency > 0.65 ? "recent" : "",
            typeFit > 0.8 ? "type-fit" : "",
          ].filter(Boolean),
        };
      })
      .filter((candidate) => candidate.score >= this.config.minRetrievalScore)
      .sort((left, right) => right.score - left.score)
      .slice(0, this.config.retrievalLimit);

    if (ranked.length > 0) {
      await this.repository.touch(
        ranked.map((candidate) => candidate.memory.id),
        now.toISOString(),
      );
    }
    return ranked;
  }

  async observe(
    subjectId: SubjectId,
    turnId: TurnId,
    text: string,
    now: string,
  ): Promise<StoredMemory[]> {
    const safeText = stripQuotedAndCode(text).trim();
    if (!safeText || includesAny(safeText, this.config.sensitivePatterns)) {
      return [];
    }

    const extracted = this.extract(safeText);
    const memories: StoredMemory[] = [];
    for (const item of extracted) {
      const normalizedKey = `${item.kind}:${normalizeText(item.content)}`;
      const memory: StoredMemory = {
        id: this.ids.create() as MemoryId,
        subjectId,
        kind: item.kind,
        content: item.content,
        normalizedKey,
        salience: item.salience,
        confidence: item.confidence,
        sourceTurnId: turnId,
        createdAt: now,
        updatedAt: now,
        lastAccessedAt: null,
        accessCount: 0,
      };
      await this.repository.upsert(memory);
      memories.push(memory);
    }
    return memories;
  }

  private extract(
    text: string,
  ): Array<{
    kind: MemoryKind;
    content: string;
    salience: number;
    confidence: number;
  }> {
    const lower = text.toLocaleLowerCase();
    const matches: Array<{
      kind: MemoryKind;
      content: string;
      salience: number;
      confidence: number;
    }> = [];

    for (const [kind, patterns] of Object.entries(
      this.config.extractionPatterns,
    ) as Array<[MemoryKind, string[]]>) {
      for (const pattern of patterns) {
        const index = lower.indexOf(pattern.toLocaleLowerCase());
        if (index < 0) continue;

        const end = text.slice(index).search(/[.!?\n]/u);
        const raw =
          end >= 0
            ? text.slice(index, index + end)
            : text.slice(index, index + 280);
        const content = raw.trim();
        if (content.length < pattern.length + 2) continue;

        matches.push({
          kind,
          content,
          salience:
            kind === "preference" || kind === "user_profile" ? 0.9 : 0.82,
          confidence: kind === "important_fact" ? 0.94 : 0.88,
        });
        break;
      }
    }
    return matches.slice(0, 2);
  }

  private typeFit(
    query: string,
    kind: MemoryKind,
    memoryContent: string,
  ): number {
    const normalized = query.toLocaleLowerCase();
    const conversationalPreference =
      kind === "preference" &&
      /(?:answer|response|reply|format|brief|concise|detail|question|tone|bullet)/u.test(
        memoryContent.toLocaleLowerCase(),
      );
    if (conversationalPreference) return 1;
    if (
      (normalized.includes("recommend") || normalized.includes("choose")) &&
      kind === "preference"
    ) {
      return 1;
    }
    if (
      (normalized.includes("goal") || normalized.includes("plan")) &&
      kind === "goal"
    ) {
      return 1;
    }
    if (
      (normalized.includes("remember") || normalized.includes("about me")) &&
      (kind === "user_profile" || kind === "important_fact")
    ) {
      return 1;
    }
    return this.config.kindWeights[kind];
  }
}
