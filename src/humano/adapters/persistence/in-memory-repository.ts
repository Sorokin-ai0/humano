import type {
  ConversationRepository,
  MemoryRepository,
  SubjectDataRepository,
  TrainingEventRepository,
} from "../../ports/contracts";
import type {
  ConversationTurn,
  FeedbackRecord,
  MemoryId,
  SessionId,
  StoredMemory,
  SubjectId,
  TrainingEventV2,
} from "../../domain/types";

/** Deterministic adapter used by tests and non-durable evaluation runs. */
export class InMemoryRepository
  implements
    ConversationRepository,
    MemoryRepository,
    SubjectDataRepository,
    TrainingEventRepository
{
  readonly turns: ConversationTurn[] = [];
  readonly memories: StoredMemory[] = [];
  readonly events: TrainingEventV2[] = [];
  readonly feedback: FeedbackRecord[] = [];
  private readonly sessions = new Map<SessionId, SubjectId>();

  async ensureSession(
    sessionId: SessionId,
    subjectId: SubjectId,
    now: string,
  ): Promise<void> {
    void now;
    this.sessions.set(sessionId, subjectId);
  }

  async listTurns(
    sessionId: SessionId,
    limit: number,
  ): Promise<ConversationTurn[]> {
    return this.turns
      .filter((turn) => turn.sessionId === sessionId)
      .slice(-limit)
      .map((turn) => ({ ...turn }));
  }

  async appendTurn(
    turn: Omit<ConversationTurn, "ordinal">,
  ): Promise<ConversationTurn> {
    const ordinal =
      this.turns.filter((item) => item.sessionId === turn.sessionId).length + 1;
    const stored = { ...turn, ordinal };
    this.turns.push(stored);
    return { ...stored };
  }

  async deleteSession(
    sessionId: SessionId,
    subjectId: SubjectId,
  ): Promise<void> {
    if (this.sessions.get(sessionId) !== subjectId) return;
    this.sessions.delete(sessionId);
    this.turns.splice(
      0,
      this.turns.length,
      ...this.turns.filter((turn) => turn.sessionId !== sessionId),
    );
  }

  async listForSubject(
    subjectId: SubjectId,
    limit: number,
  ): Promise<StoredMemory[]> {
    return this.memories
      .filter((memory) => memory.subjectId === subjectId)
      .sort((left, right) => right.salience - left.salience)
      .slice(0, limit)
      .map((memory) => ({ ...memory }));
  }

  async upsert(memory: StoredMemory): Promise<void> {
    const index = this.memories.findIndex(
      (item) =>
        item.subjectId === memory.subjectId &&
        item.normalizedKey === memory.normalizedKey,
    );
    if (index >= 0) {
      this.memories[index] = { ...this.memories[index], ...memory };
    } else {
      this.memories.push({ ...memory });
    }
  }

  async touch(ids: MemoryId[], now: string): Promise<void> {
    for (const memory of this.memories) {
      if (!ids.includes(memory.id)) continue;
      memory.lastAccessedAt = now;
      memory.accessCount += 1;
    }
  }

  async deleteForSubject(subjectId: SubjectId): Promise<void> {
    this.memories.splice(
      0,
      this.memories.length,
      ...this.memories.filter((memory) => memory.subjectId !== subjectId),
    );
  }

  async deleteAllForSubject(subjectId: SubjectId): Promise<void> {
    const sessionIds = new Set(
      [...this.sessions.entries()]
        .filter(([, owner]) => owner === subjectId)
        .map(([sessionId]) => sessionId),
    );
    for (const sessionId of sessionIds) this.sessions.delete(sessionId);
    this.turns.splice(
      0,
      this.turns.length,
      ...this.turns.filter((turn) => !sessionIds.has(turn.sessionId)),
    );
    this.events.splice(
      0,
      this.events.length,
      ...this.events.filter((event) => !sessionIds.has(event.sessionId)),
    );
    this.feedback.splice(
      0,
      this.feedback.length,
      ...this.feedback.filter((record) => !sessionIds.has(record.sessionId)),
    );
    await this.deleteForSubject(subjectId);
  }

  async append(event: TrainingEventV2): Promise<void> {
    this.events.push(event);
  }

  async addFeedback(feedback: FeedbackRecord): Promise<void> {
    const index = this.feedback.findIndex(
      (record) => record.turnId === feedback.turnId,
    );
    if (index >= 0) this.feedback[index] = feedback;
    else this.feedback.push(feedback);
  }
}
