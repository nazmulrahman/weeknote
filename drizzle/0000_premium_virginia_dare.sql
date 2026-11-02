CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`task` text NOT NULL,
	`member` text NOT NULL,
	`message` text NOT NULL,
	`time` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`availability` text DEFAULT 'Available' NOT NULL,
	`seen` integer NOT NULL,
	`sample` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`task` text NOT NULL,
	`member` text NOT NULL,
	`start` integer NOT NULL,
	`end` integer,
	`budget` integer,
	`remind` integer,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_running_session` ON `sessions` (`member`) WHERE "sessions"."end" IS NULL;--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`project` text DEFAULT 'General' NOT NULL,
	`owner` text NOT NULL,
	`assignees` text NOT NULL,
	`week` text NOT NULL,
	`deadline` text,
	`estimate` real,
	`progress` integer DEFAULT 0 NOT NULL,
	`priority` text DEFAULT 'Normal' NOT NULL,
	`blocked` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`completed` integer,
	`created` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`sample` integer DEFAULT 0 NOT NULL
);
