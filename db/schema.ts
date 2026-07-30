import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const conversations = sqliteTable(
  "humano_conversations",
  {
    id: text("id").primaryKey(),
    subjectId: text("subject_id").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("humano_conversations_subject_idx").on(
      table.subjectId,
      table.updatedAt,
    ),
  ],
);

export const turns = sqliteTable(
  "humano_turns",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    estimatedTokens: integer("estimated_tokens").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("humano_turns_session_ordinal_idx").on(
      table.sessionId,
      table.ordinal,
    ),
    index("humano_turns_session_created_idx").on(
      table.sessionId,
      table.createdAt,
    ),
  ],
);

export const memories = sqliteTable(
  "humano_memories",
  {
    id: text("id").primaryKey(),
    subjectId: text("subject_id").notNull(),
    kind: text("kind", {
      enum: [
        "long_term",
        "user_profile",
        "important_fact",
        "preference",
        "goal",
      ],
    }).notNull(),
    content: text("content").notNull(),
    normalizedKey: text("normalized_key").notNull(),
    salience: real("salience").notNull(),
    confidence: real("confidence").notNull(),
    sourceTurnId: text("source_turn_id").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastAccessedAt: text("last_accessed_at"),
    accessCount: integer("access_count").notNull().default(0),
  },
  (table) => [
    uniqueIndex("humano_memories_subject_key_idx").on(
      table.subjectId,
      table.normalizedKey,
    ),
    index("humano_memories_subject_salience_idx").on(
      table.subjectId,
      table.salience,
    ),
  ],
);

export const trainingEvents = sqliteTable(
  "humano_training_events",
  {
    id: text("id").primaryKey(),
    eventType: text("event_type").notNull(),
    schemaVersion: text("schema_version").notNull(),
    sessionId: text("session_id").notNull(),
    turnId: text("turn_id").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("humano_training_events_turn_idx").on(table.turnId),
    index("humano_training_events_session_idx").on(
      table.sessionId,
      table.createdAt,
    ),
  ],
);

export const feedback = sqliteTable(
  "humano_feedback",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    turnId: text("turn_id").notNull(),
    rating: text("rating", { enum: ["positive", "negative"] }).notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("humano_feedback_turn_idx").on(table.turnId),
  ],
);

export const researchConsentReceipts = sqliteTable(
  "humano_research_consent_receipts",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    subjectId: text("subject_id").notNull(),
    consentVersion: text("consent_version").notNull(),
    acceptedAt: text("accepted_at").notNull(),
    country: text("country").notNull(),
    evidenceHash: text("evidence_hash").notNull(),
    acceptanceMethod: text("acceptance_method").notNull(),
  },
  (table) => [
    uniqueIndex("humano_consent_session_version_idx").on(
      table.sessionId,
      table.consentVersion,
    ),
    index("humano_consent_subject_accepted_idx").on(
      table.subjectId,
      table.acceptedAt,
    ),
  ],
);
