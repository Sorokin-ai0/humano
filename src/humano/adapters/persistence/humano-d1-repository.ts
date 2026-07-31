import type {
  ConversationRepository,
  MemoryRepository,
  SubjectDataRepository,
  TrainingEventRepository,
} from "../../ports/contracts";
import type {
  ConversationRole,
  ConversationTurn,
  FeedbackRecord,
  MemoryId,
  MemoryKind,
  SessionId,
  StoredMemory,
  SubjectId,
  TrainingEventV2,
  TurnId,
} from "../../domain/types";

interface TurnRow {
  id: string;
  session_id: string;
  ordinal: number;
  role: ConversationRole;
  content: string;
  created_at: string;
  estimated_tokens: number;
}

interface MemoryRow {
  id: string;
  subject_id: string;
  kind: MemoryKind;
  content: string;
  normalized_key: string;
  salience: number;
  confidence: number;
  source_turn_id: string;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
  access_count: number;
}

export interface ResearchConsentReceipt {
  id: string;
  sessionId: string;
  subjectId: string;
  consentVersion: string;
  acceptedAt: string;
  country: string;
  evidenceHash: string;
  acceptanceMethod: "affirmative_clickwrap";
}

/**
 * D1 adapter for durable conversation, memory, feedback, and training state.
 * Business modules only see repository ports.
 */
export class HumanoD1Repository
  implements
    ConversationRepository,
    MemoryRepository,
    SubjectDataRepository,
    TrainingEventRepository
{
  private schemaReady: Promise<void> | undefined;

  constructor(private readonly db: D1Database) {}

  async ensureSession(
    sessionId: SessionId,
    subjectId: SubjectId,
    now: string,
  ): Promise<void> {
    await this.ensureSchema();
    await this.db
      .prepare(
        `INSERT INTO humano_conversations (id, subject_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?3)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
      )
      .bind(sessionId, subjectId, now)
      .run();
  }

  async listTurns(
    sessionId: SessionId,
    limit: number,
  ): Promise<ConversationTurn[]> {
    await this.ensureSchema();
    const result = await this.db
      .prepare(
        `SELECT id, session_id, ordinal, role, content, created_at, estimated_tokens
         FROM (
           SELECT id, session_id, ordinal, role, content, created_at, estimated_tokens
           FROM humano_turns
           WHERE session_id = ?1
           ORDER BY ordinal DESC
           LIMIT ?2
         )
         ORDER BY ordinal ASC`,
      )
      .bind(sessionId, limit)
      .all<TurnRow>();
    return result.results.map((row) => this.mapTurn(row));
  }

  async appendTurn(
    turn: Omit<ConversationTurn, "ordinal">,
  ): Promise<ConversationTurn> {
    await this.ensureSchema();
    await this.db
      .prepare(
        `INSERT INTO humano_turns
           (id, session_id, ordinal, role, content, estimated_tokens, created_at)
         SELECT ?1, ?2, COALESCE(MAX(ordinal), 0) + 1, ?3, ?4, ?5, ?6
         FROM humano_turns
         WHERE session_id = ?2`,
      )
      .bind(
        turn.id,
        turn.sessionId,
        turn.role,
        turn.content,
        turn.estimatedTokens,
        turn.createdAt,
      )
      .run();
    const row = await this.db
      .prepare(
        `SELECT id, session_id, ordinal, role, content, created_at, estimated_tokens
         FROM humano_turns WHERE id = ?1`,
      )
      .bind(turn.id)
      .first<TurnRow>();
    if (!row) throw new Error("The conversation turn could not be persisted.");
    return this.mapTurn(row);
  }

  async deleteSession(
    sessionId: SessionId,
    subjectId: SubjectId,
  ): Promise<void> {
    await this.ensureSchema();
    await this.db.batch([
      this.db
        .prepare(
          "DELETE FROM humano_feedback WHERE session_id = ?1",
        )
        .bind(sessionId),
      this.db
        .prepare(
          "DELETE FROM humano_training_events WHERE session_id = ?1",
        )
        .bind(sessionId),
      this.db
        .prepare(
          "DELETE FROM humano_conversations WHERE id = ?1 AND subject_id = ?2",
        )
        .bind(sessionId, subjectId),
    ]);
  }

  async listForSubject(
    subjectId: SubjectId,
    limit: number,
  ): Promise<StoredMemory[]> {
    await this.ensureSchema();
    const result = await this.db
      .prepare(
        `SELECT id, subject_id, kind, content, normalized_key, salience,
                confidence, source_turn_id, created_at, updated_at,
                last_accessed_at, access_count
         FROM humano_memories
         WHERE subject_id = ?1
         ORDER BY salience DESC, updated_at DESC
         LIMIT ?2`,
      )
      .bind(subjectId, limit)
      .all<MemoryRow>();
    return result.results.map((row) => this.mapMemory(row));
  }

  async upsert(memory: StoredMemory): Promise<void> {
    await this.ensureSchema();
    await this.db
      .prepare(
        `INSERT INTO humano_memories
           (id, subject_id, kind, content, normalized_key, salience, confidence,
            source_turn_id, created_at, updated_at, last_accessed_at, access_count)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT(subject_id, normalized_key) DO UPDATE SET
           content = excluded.content,
           kind = excluded.kind,
           salience = MAX(humano_memories.salience, excluded.salience),
           confidence = excluded.confidence,
           source_turn_id = excluded.source_turn_id,
           updated_at = excluded.updated_at`,
      )
      .bind(
        memory.id,
        memory.subjectId,
        memory.kind,
        memory.content,
        memory.normalizedKey,
        memory.salience,
        memory.confidence,
        memory.sourceTurnId,
        memory.createdAt,
        memory.updatedAt,
        memory.lastAccessedAt,
        memory.accessCount,
      )
      .run();
  }

  async touch(ids: MemoryId[], now: string): Promise<void> {
    await this.ensureSchema();
    if (ids.length === 0) return;
    const placeholders = ids.map((_, index) => `?${index + 2}`).join(", ");
    await this.db
      .prepare(
        `UPDATE humano_memories
         SET last_accessed_at = ?1, access_count = access_count + 1
         WHERE id IN (${placeholders})`,
      )
      .bind(now, ...ids)
      .run();
  }

  async deleteForSubject(subjectId: SubjectId): Promise<void> {
    await this.ensureSchema();
    await this.db
      .prepare("DELETE FROM humano_memories WHERE subject_id = ?1")
      .bind(subjectId)
      .run();
  }

  /**
   * Removes all product data for an anonymous browser subject. Consent
   * receipts are intentionally included: deleting data also ends access and
   * requires a new agreement before the browser can use the preview again.
   */
  async deleteAllForSubject(subjectId: SubjectId): Promise<void> {
    await this.ensureSchema();
    const sessionsForSubject = `SELECT id FROM humano_conversations WHERE subject_id = ?1`;
    await this.db.batch([
      this.db
        .prepare(
          `DELETE FROM humano_feedback
           WHERE session_id IN (${sessionsForSubject})`,
        )
        .bind(subjectId),
      this.db
        .prepare(
          `DELETE FROM humano_training_events
           WHERE session_id IN (${sessionsForSubject})`,
        )
        .bind(subjectId),
      this.db
        .prepare("DELETE FROM humano_memories WHERE subject_id = ?1")
        .bind(subjectId),
      this.db
        .prepare("DELETE FROM humano_conversations WHERE subject_id = ?1")
        .bind(subjectId),
      this.db
        .prepare(
          "DELETE FROM humano_research_consent_receipts WHERE subject_id = ?1",
        )
        .bind(subjectId),
    ]);
  }

  async append(event: TrainingEventV2): Promise<void> {
    await this.ensureSchema();
    await this.db
      .prepare(
        `INSERT INTO humano_training_events
           (id, event_type, schema_version, session_id, turn_id, payload_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      )
      .bind(
        event.eventId,
        event.eventType,
        event.schemaVersion,
        event.sessionId,
        event.assistantTurnId,
        JSON.stringify(event),
        event.occurredAt,
      )
      .run();
  }

  async addFeedback(feedback: FeedbackRecord): Promise<void> {
    await this.ensureSchema();
    await this.db
      .prepare(
        `INSERT INTO humano_feedback
           (id, session_id, turn_id, rating, note, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(turn_id) DO UPDATE SET
           rating = excluded.rating,
           note = excluded.note,
           created_at = excluded.created_at`,
      )
      .bind(
        feedback.id,
        feedback.sessionId,
        feedback.turnId,
        feedback.rating,
        feedback.note,
        feedback.createdAt,
      )
      .run();
  }

  async recordResearchConsent(
    receipt: ResearchConsentReceipt,
  ): Promise<void> {
    await this.ensureSchema();
    await this.db
      .prepare(
        `INSERT INTO humano_research_consent_receipts
           (id, session_id, subject_id, consent_version, accepted_at,
            country, evidence_hash, acceptance_method)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(session_id, consent_version) DO UPDATE SET
           subject_id = excluded.subject_id,
           accepted_at = excluded.accepted_at,
           country = excluded.country,
           evidence_hash = excluded.evidence_hash,
           acceptance_method = excluded.acceptance_method`,
      )
      .bind(
        receipt.id,
        receipt.sessionId,
        receipt.subjectId,
        receipt.consentVersion,
        receipt.acceptedAt,
        receipt.country,
        receipt.evidenceHash,
        receipt.acceptanceMethod,
      )
      .run();
  }

  async hasResearchConsent(
    receiptId: string,
    consentVersion: string,
  ): Promise<boolean> {
    await this.ensureSchema();
    const row = await this.db
      .prepare(
        `SELECT 1 AS accepted
         FROM humano_research_consent_receipts
         WHERE id = ?1 AND consent_version = ?2
         LIMIT 1`,
      )
      .bind(receiptId, consentVersion)
      .first<{ accepted: number }>();
    return row?.accepted === 1;
  }

  async hasResearchConsentForSubject(
    receiptId: string,
    consentVersion: string,
    subjectId: SubjectId,
  ): Promise<boolean> {
    await this.ensureSchema();
    const row = await this.db
      .prepare(
        `SELECT 1 AS accepted
         FROM humano_research_consent_receipts
         WHERE id = ?1 AND consent_version = ?2 AND subject_id = ?3
         LIMIT 1`,
      )
      .bind(receiptId, consentVersion, subjectId)
      .first<{ accepted: number }>();
    return row?.accepted === 1;
  }

  private ensureSchema(): Promise<void> {
    this.schemaReady ??= this.initializeSchema();
    return this.schemaReady;
  }

  private async initializeSchema(): Promise<void> {
    await this.db.batch([
      this.db.prepare(`CREATE TABLE IF NOT EXISTS humano_conversations (
        id TEXT PRIMARY KEY NOT NULL,
        subject_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      this.db.prepare(`CREATE TABLE IF NOT EXISTS humano_turns (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL REFERENCES humano_conversations(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        estimated_tokens INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )`),
      this.db.prepare(`CREATE TABLE IF NOT EXISTS humano_memories (
        id TEXT PRIMARY KEY NOT NULL,
        subject_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('long_term', 'user_profile', 'important_fact', 'preference', 'goal')),
        content TEXT NOT NULL,
        normalized_key TEXT NOT NULL,
        salience REAL NOT NULL,
        confidence REAL NOT NULL,
        source_turn_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_accessed_at TEXT,
        access_count INTEGER NOT NULL DEFAULT 0
      )`),
      this.db.prepare(`CREATE TABLE IF NOT EXISTS humano_training_events (
        id TEXT PRIMARY KEY NOT NULL,
        event_type TEXT NOT NULL,
        schema_version TEXT NOT NULL,
        session_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`),
      this.db.prepare(`CREATE TABLE IF NOT EXISTS humano_feedback (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        rating TEXT NOT NULL CHECK(rating IN ('positive', 'negative')),
        note TEXT,
        created_at TEXT NOT NULL
      )`),
      this.db.prepare(`CREATE TABLE IF NOT EXISTS humano_research_consent_receipts (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        consent_version TEXT NOT NULL,
        accepted_at TEXT NOT NULL,
        country TEXT NOT NULL,
        evidence_hash TEXT NOT NULL,
        acceptance_method TEXT NOT NULL
      )`),
      this.db.prepare(
        "CREATE INDEX IF NOT EXISTS humano_conversations_subject_idx ON humano_conversations(subject_id, updated_at)",
      ),
      this.db.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS humano_turns_session_ordinal_idx ON humano_turns(session_id, ordinal)",
      ),
      this.db.prepare(
        "CREATE INDEX IF NOT EXISTS humano_turns_session_created_idx ON humano_turns(session_id, created_at)",
      ),
      this.db.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS humano_memories_subject_key_idx ON humano_memories(subject_id, normalized_key)",
      ),
      this.db.prepare(
        "CREATE INDEX IF NOT EXISTS humano_memories_subject_salience_idx ON humano_memories(subject_id, salience)",
      ),
      this.db.prepare(
        "CREATE INDEX IF NOT EXISTS humano_training_events_turn_idx ON humano_training_events(turn_id)",
      ),
      this.db.prepare(
        "CREATE INDEX IF NOT EXISTS humano_training_events_session_idx ON humano_training_events(session_id, created_at)",
      ),
      this.db.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS humano_feedback_turn_idx ON humano_feedback(turn_id)",
      ),
      this.db.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS humano_consent_session_version_idx ON humano_research_consent_receipts(session_id, consent_version)",
      ),
      this.db.prepare(
        "CREATE INDEX IF NOT EXISTS humano_consent_subject_accepted_idx ON humano_research_consent_receipts(subject_id, accepted_at)",
      ),
    ]);
  }

  private mapTurn(row: TurnRow): ConversationTurn {
    return {
      id: row.id as TurnId,
      sessionId: row.session_id as SessionId,
      ordinal: row.ordinal,
      role: row.role,
      content: row.content,
      createdAt: row.created_at,
      estimatedTokens: row.estimated_tokens,
    };
  }

  private mapMemory(row: MemoryRow): StoredMemory {
    return {
      id: row.id as MemoryId,
      subjectId: row.subject_id as SubjectId,
      kind: row.kind,
      content: row.content,
      normalizedKey: row.normalized_key,
      salience: row.salience,
      confidence: row.confidence,
      sourceTurnId: row.source_turn_id as TurnId,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastAccessedAt: row.last_accessed_at,
      accessCount: row.access_count,
    };
  }
}
