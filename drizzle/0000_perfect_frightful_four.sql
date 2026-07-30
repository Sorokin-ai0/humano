CREATE TABLE `humano_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `humano_conversations_subject_idx` ON `humano_conversations` (`subject_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `humano_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`rating` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `humano_feedback_turn_idx` ON `humano_feedback` (`turn_id`);--> statement-breakpoint
CREATE TABLE `humano_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_id` text NOT NULL,
	`kind` text NOT NULL,
	`content` text NOT NULL,
	`normalized_key` text NOT NULL,
	`salience` real NOT NULL,
	`confidence` real NOT NULL,
	`source_turn_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_accessed_at` text,
	`access_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `humano_memories_subject_key_idx` ON `humano_memories` (`subject_id`,`normalized_key`);--> statement-breakpoint
CREATE INDEX `humano_memories_subject_salience_idx` ON `humano_memories` (`subject_id`,`salience`);--> statement-breakpoint
CREATE TABLE `humano_training_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`schema_version` text NOT NULL,
	`session_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `humano_training_events_turn_idx` ON `humano_training_events` (`turn_id`);--> statement-breakpoint
CREATE INDEX `humano_training_events_session_idx` ON `humano_training_events` (`session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `humano_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`estimated_tokens` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `humano_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `humano_turns_session_ordinal_idx` ON `humano_turns` (`session_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `humano_turns_session_created_idx` ON `humano_turns` (`session_id`,`created_at`);