CREATE TYPE "public"."alert_type" AS ENUM('echeance_j7', 'echeance_j3', 'echeance_j1', 'echeance_jour_j', 'echeance_depassee', 'serie_en_peril', 'dette_reports', 'pic_charge');--> statement-breakpoint
CREATE TYPE "public"."deadline_type" AS ENUM('examen', 'controle_continu', 'autre');--> statement-breakpoint
CREATE TYPE "public"."error_entry_statut" AS ENUM('active', 'resolue');--> statement-breakpoint
CREATE TYPE "public"."error_entry_type" AS ENUM('omission', 'deformation', 'confusion', 'imprecision');--> statement-breakpoint
CREATE TYPE "public"."fiche_set_statut" AS ENUM('actif', 'archive');--> statement-breakpoint
CREATE TYPE "public"."fiche_statut" AS ENUM('nouvelle', 'en_revision', 'archivee');--> statement-breakpoint
CREATE TYPE "public"."note_fsrs" AS ENUM('again', 'hard', 'good', 'easy');--> statement-breakpoint
CREATE TYPE "public"."prompt_log_appel" AS ENUM('correction_erreurs');--> statement-breakpoint
CREATE TYPE "public"."prompt_log_statut" AS ENUM('ok', 'retry', 'echec');--> statement-breakpoint
CREATE TYPE "public"."refile_item_type" AS ENUM('revision', 'etude');--> statement-breakpoint
CREATE TYPE "public"."study_cycle_etat" AS ENUM('lecture', 'blurting', 'correction', 'clos');--> statement-breakpoint
CREATE TYPE "public"."study_cycle_type" AS ENUM('etude', 'revision');--> statement-breakpoint
CREATE TYPE "public"."subject_statut" AS ENUM('active', 'archivee');--> statement-breakpoint
CREATE TYPE "public"."verdict" AS ENUM('bon', 'insuffisant');--> statement-breakpoint
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
CREATE TABLE "deferral_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"item_type" "refile_item_type" NOT NULL,
	"item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"avance" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"fiche_id" uuid NOT NULL,
	"tentative_id" uuid NOT NULL,
	"type" "error_entry_type" NOT NULL,
	"description" text NOT NULL,
	"statut" "error_entry_statut" DEFAULT 'active' NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiche" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"titre" text NOT NULL,
	"contenu" text NOT NULL,
	"content_hash" text NOT NULL,
	"statut" "fiche_statut" DEFAULT 'nouvelle' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiche_set" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"titre" text NOT NULL,
	"markdown" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"statut" "fiche_set_statut" DEFAULT 'actif' NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "planner_config" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"nouvelles_par_jour" integer DEFAULT 3 NOT NULL,
	"debut_s3" date,
	"debut_s4" date,
	"gels_serie_restants" integer DEFAULT 2 NOT NULL,
	"heure_alerte_serie" text DEFAULT '20:00' NOT NULL,
	"seuil_dette_reports" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appel" "prompt_log_appel" NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"duree_ms" integer NOT NULL,
	"statut" "prompt_log_statut" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queue_order" (
	"date" date PRIMARY KEY NOT NULL,
	"order" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refile_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"item_type" "refile_item_type" NOT NULL,
	"item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_card" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fiche_id" uuid NOT NULL,
	"due" date NOT NULL,
	"stability" real NOT NULL,
	"difficulty" real NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"last_review" timestamp with time zone,
	"gelee" boolean DEFAULT false NOT NULL,
	CONSTRAINT "review_card_fiche_id_unique" UNIQUE("fiche_id")
);
--> statement-breakpoint
CREATE TABLE "serie_gel" (
	"date" date PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_cycle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"fiche_id" uuid NOT NULL,
	"type" "study_cycle_type" NOT NULL,
	"etat" "study_cycle_etat" NOT NULL,
	"note" "note_fsrs",
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subject" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"semestre" text NOT NULL,
	"ordre" integer NOT NULL,
	"date_examen" date,
	"statut" "subject_statut" DEFAULT 'active' NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tentative" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"fiche_id" uuid NOT NULL,
	"fiche_hash" text NOT NULL,
	"numero" integer NOT NULL,
	"input" text NOT NULL,
	"correction" jsonb,
	"verdict" "verdict",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_deadline_id_deadline_id_fk" FOREIGN KEY ("deadline_id") REFERENCES "public"."deadline"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline" ADD CONSTRAINT "deadline_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_entry" ADD CONSTRAINT "error_entry_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_entry" ADD CONSTRAINT "error_entry_fiche_id_fiche_id_fk" FOREIGN KEY ("fiche_id") REFERENCES "public"."fiche"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_entry" ADD CONSTRAINT "error_entry_tentative_id_tentative_id_fk" FOREIGN KEY ("tentative_id") REFERENCES "public"."tentative"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiche" ADD CONSTRAINT "fiche_set_id_fiche_set_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."fiche_set"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiche_set" ADD CONSTRAINT "fiche_set_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner_config" ADD CONSTRAINT "planner_config_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_card" ADD CONSTRAINT "review_card_fiche_id_fiche_id_fk" FOREIGN KEY ("fiche_id") REFERENCES "public"."fiche"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_cycle" ADD CONSTRAINT "study_cycle_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_cycle" ADD CONSTRAINT "study_cycle_fiche_id_fiche_id_fk" FOREIGN KEY ("fiche_id") REFERENCES "public"."fiche"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject" ADD CONSTRAINT "subject_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tentative" ADD CONSTRAINT "tentative_cycle_id_study_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."study_cycle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tentative" ADD CONSTRAINT "tentative_fiche_id_fiche_id_fk" FOREIGN KEY ("fiche_id") REFERENCES "public"."fiche"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_dedupe" ON "alert" USING btree ("type","date_ref",coalesce("deadline_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE UNIQUE INDEX "study_cycle_one_open_per_user" ON "study_cycle" USING btree ("user_id") WHERE "study_cycle"."closed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");