ALTER TABLE board_notes ADD COLUMN x integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE board_notes ADD COLUMN y integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE board_notes ADD COLUMN width integer DEFAULT 190 NOT NULL;
--> statement-breakpoint
ALTER TABLE board_notes ADD COLUMN height integer DEFAULT 180 NOT NULL;
--> statement-breakpoint
WITH positions AS (SELECT id,ROW_NUMBER() OVER (ORDER BY created,id)-1 AS n FROM board_notes) UPDATE board_notes SET x=(SELECT (n % 10)*214 FROM positions WHERE positions.id=board_notes.id),y=(SELECT CAST((n % 200)/10 AS INTEGER)*200 FROM positions WHERE positions.id=board_notes.id);
