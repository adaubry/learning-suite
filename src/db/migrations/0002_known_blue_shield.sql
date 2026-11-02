ALTER TABLE "planner_config" ALTER COLUMN "nouvelles_par_jour" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "planner_config" ALTER COLUMN "nouvelles_par_jour" DROP NOT NULL;--> statement-breakpoint
-- Demande de l'humain (DECISIONS.md 2026-11-02) : toutes les nouvelles fiches, sans plafond.
UPDATE "planner_config" SET "nouvelles_par_jour" = NULL;
