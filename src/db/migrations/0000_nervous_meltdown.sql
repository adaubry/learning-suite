CREATE TYPE "public"."audit_event_type" AS ENUM('override_verdict', 'revelation_correction', 'report', 'acquittement_anomalie', 'validation_sur_insuffisant');--> statement-breakpoint
CREATE TYPE "public"."chapter_statut" AS ENUM('actif', 'archive');--> statement-breakpoint
CREATE TYPE "public"."correction_guide_statut" AS ENUM('a_valider', 'valide', 'obsolete');--> statement-breakpoint
CREATE TYPE "public"."divulgation" AS ENUM('controlee', 'complete');--> statement-breakpoint
CREATE TYPE "public"."error_entry_statut" AS ENUM('active', 'resolue');--> statement-breakpoint
CREATE TYPE "public"."error_entry_type" AS ENUM('omission', 'deformation', 'confusion', 'imprecision');--> statement-breakpoint
CREATE TYPE "public"."note_fsrs" AS ENUM('again', 'hard', 'good', 'easy');--> statement-breakpoint
CREATE TYPE "public"."prompt_log_appel" AS ENUM('sectionnement', 'rubrique', 'correction_erreurs', 'feynman', 'transcription');--> statement-breakpoint
CREATE TYPE "public"."prompt_log_statut" AS ENUM('ok', 'retry', 'echec');--> statement-breakpoint
CREATE TYPE "public"."refile_item_type" AS ENUM('revision', 'etude');--> statement-breakpoint
CREATE TYPE "public"."section_statut" AS ENUM('importee', 'a_trier', 'active', 'exclue', 'rubrique_a_valider', 'prete', 'validee', 'en_revision', 'archivee');--> statement-breakpoint
CREATE TYPE "public"."study_cycle_etat" AS ENUM('rubrique_a_valider', 'blurting', 'correction', 'feynman', 'bilan', 'clos');--> statement-breakpoint
CREATE TYPE "public"."study_cycle_type" AS ENUM('etude', 'revision');--> statement-breakpoint
CREATE TYPE "public"."study_session_type" AS ENUM('blurting', 'feynman', 'revision');--> statement-breakpoint
CREATE TYPE "public"."subject_statut" AS ENUM('active', 'archivee');--> statement-breakpoint
CREATE TYPE "public"."verdict" AS ENUM('acquis', 'insuffisant');--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "audit_event_type" NOT NULL,
	"entite_type" text NOT NULL,
	"entite_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"titre" text NOT NULL,
	"markdown" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"content_hash" text NOT NULL,
	"maj" timestamp with time zone DEFAULT now() NOT NULL,
	"statut" "chapter_statut" DEFAULT 'actif' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "correction_guide" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"chapter_version" integer NOT NULL,
	"contenu" jsonb NOT NULL,
	"statut" "correction_guide_statut" DEFAULT 'a_valider' NOT NULL,
	"valide_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "deferral_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"item_type" "refile_item_type" NOT NULL,
	"item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"type" "error_entry_type" NOT NULL,
	"description" text NOT NULL,
	"statut" "error_entry_statut" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planner_config" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"nouvelles_par_jour" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_config" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"methodologie_titres_globale" text
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
	"section_id" uuid NOT NULL,
	"due" date NOT NULL,
	"stability" real NOT NULL,
	"difficulty" real NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"last_review" timestamp with time zone,
	CONSTRAINT "review_card_section_id_unique" UNIQUE("section_id")
);
--> statement-breakpoint
CREATE TABLE "section" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"chapter_version" integer NOT NULL,
	"titre" text NOT NULL,
	"ordre" integer NOT NULL,
	"niveau_source" smallint NOT NULL,
	"contenu" text NOT NULL,
	"segments_gras" jsonb,
	"commentaires" jsonb,
	"importance" smallint NOT NULL,
	"statut" "section_statut" DEFAULT 'importee' NOT NULL,
	"parent_ids" uuid[],
	CONSTRAINT "importance_range" CHECK ("section"."importance" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "study_cycle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"type" "study_cycle_type" NOT NULL,
	"etat" "study_cycle_etat" DEFAULT 'rubrique_a_valider' NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"guide_id" uuid NOT NULL,
	"chapter_version" integer NOT NULL,
	"type" "study_session_type" NOT NULL,
	"tentative" integer NOT NULL,
	"input" text NOT NULL,
	"correction" jsonb,
	"verdict_llm" "verdict",
	"verdict_final" "verdict",
	"override" boolean DEFAULT false NOT NULL,
	"note_fsrs" "note_fsrs",
	"divulgation" "divulgation" NOT NULL,
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
	"methodologie_titres" text
);
--> statement-breakpoint
ALTER TABLE "chapter" ADD CONSTRAINT "chapter_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_guide" ADD CONSTRAINT "correction_guide_section_id_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."section"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_entry" ADD CONSTRAINT "error_entry_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_entry" ADD CONSTRAINT "error_entry_section_id_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."section"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_entry" ADD CONSTRAINT "error_entry_session_id_study_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner_config" ADD CONSTRAINT "planner_config_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_config" ADD CONSTRAINT "prompt_config_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_card" ADD CONSTRAINT "review_card_section_id_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."section"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section" ADD CONSTRAINT "section_chapter_id_chapter_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_cycle" ADD CONSTRAINT "study_cycle_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_cycle" ADD CONSTRAINT "study_cycle_section_id_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."section"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_session" ADD CONSTRAINT "study_session_cycle_id_study_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."study_cycle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_session" ADD CONSTRAINT "study_session_section_id_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."section"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_session" ADD CONSTRAINT "study_session_guide_id_correction_guide_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."correction_guide"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject" ADD CONSTRAINT "subject_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "correction_guide_section_non_obsolete" ON "correction_guide" USING btree ("section_id") WHERE "correction_guide"."statut" <> 'obsolete';--> statement-breakpoint
CREATE UNIQUE INDEX "study_cycle_one_open_per_user" ON "study_cycle" USING btree ("user_id") WHERE "study_cycle"."closed_at" IS NULL;