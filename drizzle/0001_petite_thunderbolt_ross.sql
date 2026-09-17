CREATE TABLE `tool_requests` (
	`owner` text NOT NULL,
	`request_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`result` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner`, `request_id`)
);
