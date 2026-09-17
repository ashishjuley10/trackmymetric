CREATE TABLE `daily_entries` (
	`owner` text NOT NULL,
	`date` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`owner`, `date`)
);
--> statement-breakpoint
CREATE TABLE `habit_logs` (
	`owner` text NOT NULL,
	`habit_id` text NOT NULL,
	`date` text NOT NULL,
	PRIMARY KEY(`owner`, `habit_id`, `date`)
);
--> statement-breakpoint
CREATE TABLE `habits` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`created` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE TABLE `preferences` (
	`owner` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL
);
