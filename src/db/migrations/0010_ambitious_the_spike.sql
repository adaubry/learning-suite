CREATE TYPE "public"."alert_type" AS ENUM('echeance_j7', 'echeance_j3', 'echeance_j1', 'echeance_jour_j', 'echeance_depassee', 'serie_en_peril', 'dette_reports', 'pic_charge');--> statement-breakpoint
CREATE TYPE "public"."deadline_type" AS ENUM('examen', 'controle_continu', 'autre');--> statement-breakpoint
CREATE TABLE "alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "alert_type" NOT NULL,
	"deadline_id" uuid,
	"date_ref" date NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_at" timestamp with time zone,
	"snoozed_until" date
);
--> statement-breakpoint
CREATE TABLE "deadline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid,
	"type" "deadline_type" NOT NULL,
	"libelle" text NOT NULL,
	"due_date" date NOT NULL,
	"coefficient" real,
	"duree_min" integer,
	"recurrence_group_id" uuid,
	"ack_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "serie_gel" (
	"date" date PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "planner_config" ADD COLUMN "debut_s3" date;--> statement-breakpoint
ALTER TABLE "planner_config" ADD COLUMN "debut_s4" date;--> statement-breakpoint
ALTER TABLE "planner_config" ADD COLUMN "gels_serie_restants" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "planner_config" ADD COLUMN "heure_alerte_serie" text DEFAULT '20:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "planner_config" ADD COLUMN "seuil_dette_reports" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_deadline_id_deadline_id_fk" FOREIGN KEY ("deadline_id") REFERENCES "public"."deadline"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline" ADD CONSTRAINT "deadline_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_dedupe" ON "alert" USING btree ("type","date_ref",coalesce("deadline_id", '00000000-0000-0000-0000-000000000000'::uuid));