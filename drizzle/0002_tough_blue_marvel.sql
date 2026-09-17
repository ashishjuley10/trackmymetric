CREATE TABLE `health_imports` (
	`owner` text NOT NULL,
	`request_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`result` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner`, `request_id`)
);
--> statement-breakpoint
CREATE INDEX `health_imports_owner_created` ON `health_imports` (`owner`,`created_at`);