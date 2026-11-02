ALTER TABLE sessions ADD COLUMN finish_kind text;
--> statement-breakpoint
CREATE TABLE score_adjustments (id text PRIMARY KEY NOT NULL, member text NOT NULL, week text NOT NULL, deadline_points integer DEFAULT 0 NOT NULL, low_tasks integer DEFAULT 0 NOT NULL, high_tasks integer DEFAULT 0 NOT NULL, uneven_days integer DEFAULT 0 NOT NULL, unapproved_hours real DEFAULT 0 NOT NULL, note text DEFAULT '' NOT NULL, updated integer NOT NULL, actor text NOT NULL, revision integer DEFAULT 0 NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX score_member_week ON score_adjustments (member,week);
