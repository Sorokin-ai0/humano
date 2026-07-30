CREATE TABLE `humano_research_consent_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`consent_version` text NOT NULL,
	`accepted_at` text NOT NULL,
	`country` text NOT NULL,
	`evidence_hash` text NOT NULL,
	`acceptance_method` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `humano_consent_session_version_idx` ON `humano_research_consent_receipts` (`session_id`,`consent_version`);--> statement-breakpoint
CREATE INDEX `humano_consent_subject_accepted_idx` ON `humano_research_consent_receipts` (`subject_id`,`accepted_at`);