CREATE TABLE `accounts` (
	`member` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_username_unique` ON `accounts` (`username`);--> statement-breakpoint
CREATE TABLE `admin_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`target` text NOT NULL,
	`message` text NOT NULL,
	`time` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_setup` (
	`id` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `login_sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`member` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER preserve_last_admin_role BEFORE UPDATE OF role ON members
WHEN OLD.role='manager' AND NEW.role<>'manager'
AND EXISTS (SELECT 1 FROM accounts WHERE member=OLD.id AND active=1)
AND (SELECT COUNT(*) FROM accounts a JOIN members m ON m.id=a.member WHERE a.active=1 AND m.role='manager')=1
BEGIN SELECT RAISE(ABORT, 'Cannot remove the last active admin'); END;
--> statement-breakpoint
CREATE TRIGGER preserve_last_admin_access BEFORE UPDATE OF active ON accounts
WHEN OLD.active=1 AND NEW.active=0
AND EXISTS (SELECT 1 FROM members WHERE id=OLD.member AND role='manager')
AND (SELECT COUNT(*) FROM accounts a JOIN members m ON m.id=a.member WHERE a.active=1 AND m.role='manager')=1
BEGIN SELECT RAISE(ABORT, 'Cannot disable the last active admin'); END;
