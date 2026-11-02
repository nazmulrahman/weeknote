CREATE TABLE board_notes (id text PRIMARY KEY NOT NULL, author text NOT NULL, body text NOT NULL, color text DEFAULT 'yellow' NOT NULL, created integer NOT NULL, updated integer NOT NULL, revision integer DEFAULT 0 NOT NULL, archived integer);
--> statement-breakpoint
CREATE TABLE messages (id text PRIMARY KEY NOT NULL, sender text NOT NULL, recipient text, body text NOT NULL, created integer NOT NULL, updated integer NOT NULL, revision integer DEFAULT 0 NOT NULL, deleted integer, read integer);
--> statement-breakpoint
CREATE INDEX messages_conversation ON messages (sender, recipient, created, id);
--> statement-breakpoint
CREATE INDEX messages_recipient ON messages (recipient, created, id);
