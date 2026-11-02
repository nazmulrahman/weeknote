ALTER TABLE tasks ADD COLUMN deleted integer;
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN checked integer;
--> statement-breakpoint
CREATE TABLE backups (id text PRIMARY KEY NOT NULL, created integer NOT NULL, kind text NOT NULL, payload text NOT NULL);
