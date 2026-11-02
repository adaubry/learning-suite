import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  real,
  boolean,
  date,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// Modèle v2 (ARCHITECTURE.md §4). Better-Auth possède la table `user`
// (src/db/auth-schema.ts), référencée directement — mono-utilisateur.
export * from "./auth-schema";

// --- Enums ---

export const subjectStatutEnum = pgEnum("subject_statut", ["active", "archivee"]);
export const ficheSetStatutEnum = pgEnum("fiche_set_statut", ["actif", "archive"]);
export const ficheStatutEnum = pgEnum("fiche_statut", ["nouvelle", "en_revision", "archivee"]);
export const studyCycleTypeEnum = pgEnum("study_cycle_type", ["etude", "revision"]);
export const studyCycleEtatEnum = pgEnum("study_cycle_etat", ["lecture", "blurting", "correction", "clos"]);
export const verdictEnum = pgEnum("verdict", ["bon", "insuffisant"]);
export const noteFsrsEnum = pgEnum("note_fsrs", ["again", "hard", "good", "easy"]);
export const errorEntryTypeEnum = pgEnum("error_entry_type", ["omission", "deformation", "confusion", "imprecision"]);
export const errorEntryStatutEnum = pgEnum("error_entry_statut", ["active", "resolue"]);
export const refileItemTypeEnum = pgEnum("refile_item_type", ["revision", "etude"]);
export const deadlineTypeEnum = pgEnum("deadline_type", ["examen", "controle_continu", "autre"]);
export const alertTypeEnum = pgEnum("alert_type", [
  "echeance_j7",
  "echeance_j3",
  "echeance_j1",
  "echeance_jour_j",
  "echeance_depassee",
  "serie_en_peril",
  "dette_reports",
  "pic_charge",
]);

// --- Configuration ---

export const plannerConfig = pgTable("planner_config", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => user.id),
  nouvellesParJour: integer("nouvelles_par_jour").notNull().default(3),
  // Régularité (IMPLEMENT_SCHEDULE.md §3) : lundi de la semaine 1 du S3/S4.
  debutS3: date("debut_s3"),
  debutS4: date("debut_s4"),
  gelsSerieRestants: integer("gels_serie_restants").notNull().default(2),
  heureAlerteSerie: text("heure_alerte_serie").notNull().default("20:00"),
  seuilDetteReports: integer("seuil_dette_reports").notNull().default(3),
});

// --- Contenu : matières → sets → fiches ---

export const subject = pgTable("subject", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id),
  nom: text("nom").notNull(),
  semestre: text("semestre").notNull(),
  ordre: integer("ordre").notNull(),
  dateExamen: date("date_examen"),
  statut: subjectStatutEnum("statut").notNull().default("active"),
  // Début du gel : le dégel décale `due` de la durée réelle de l'archivage.
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const ficheSet = pgTable("fiche_set", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subject.id),
  titre: text("titre").notNull(),
  // Source du dernier import, telle quelle (export Google Docs).
  markdown: text("markdown").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  statut: ficheSetStatutEnum("statut").notNull().default("actif"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const fiche = pgTable("fiche", {
  id: uuid("id").primaryKey().defaultRandom(),
  setId: uuid("set_id")
    .notNull()
    .references(() => ficheSet.id),
  numero: integer("numero").notNull(),
  titre: text("titre").notNull(),
  // Corps de la fiche (après son titre 2), affiché tel quel ; les points de
  // contrôle en sont dérivés à la volée (core/fiche/extractPoints).
  contenu: text("contenu").notNull(),
  contentHash: text("content_hash").notNull(),
  statut: ficheStatutEnum("statut").notNull().default("nouvelle"),
});

// --- Répétition espacée ---

export const reviewCard = pgTable("review_card", {
  id: uuid("id").primaryKey().defaultRandom(),
  ficheId: uuid("fiche_id")
    .notNull()
    .unique()
    .references(() => fiche.id),
  due: date("due").notNull(),
  stability: real("stability").notNull(),
  difficulty: real("difficulty").notNull(),
  reps: integer("reps").notNull().default(0),
  lapses: integer("lapses").notNull().default(0),
  lastReview: timestamp("last_review", { withTimezone: true }),
  // Gel (archivage) : seul ReviewService y touche.
  gelee: boolean("gelee").notNull().default(false),
});

// --- Sessions ---

export const studyCycle = pgTable(
  "study_cycle",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    ficheId: uuid("fiche_id")
      .notNull()
      .references(() => fiche.id),
    // Label (badge, tri du planificateur) ; seul effet : une révision saute la lecture.
    type: studyCycleTypeEnum("type").notNull(),
    etat: studyCycleEtatEnum("etat").notNull(),
    // Auto-note posée à la clôture ; null si abandonné.
    note: noteFsrsEnum("note"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // une seule session ouverte par utilisateur (ARCHITECTURE §8)
    uniqueIndex("study_cycle_one_open_per_user")
      .on(t.userId)
      .where(sql`${t.closedAt} IS NULL`),
  ],
);

export const tentative = pgTable("tentative", {
  id: uuid("id").primaryKey().defaultRandom(),
  cycleId: uuid("cycle_id")
    .notNull()
    .references(() => studyCycle.id),
  ficheId: uuid("fiche_id")
    .notNull()
    .references(() => fiche.id),
  // Version de la fiche contre laquelle ce blurting a été corrigé.
  ficheHash: text("fiche_hash").notNull(),
  numero: integer("numero").notNull(),
  input: text("input").notNull(),
  // Inséré sans correction (sauvegarde avant l'appel LLM), complété une fois.
  correction: jsonb("correction"),
  verdict: verdictEnum("verdict"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const errorEntry = pgTable("error_entry", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subject.id),
  ficheId: uuid("fiche_id")
    .notNull()
    .references(() => fiche.id),
  tentativeId: uuid("tentative_id")
    .notNull()
    .references(() => tentative.id),
  type: errorEntryTypeEnum("type").notNull(),
  description: text("description").notNull(),
  statut: errorEntryStatutEnum("statut").notNull().default("active"),
  occurrences: integer("occurrences").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Planificateur (mono-utilisateur : pas de user_id) ---
// item_id référence une fiche (pas de FK : cible polymorphe historiquement, assumé).

export const deferralLog = pgTable("deferral_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: date("date").notNull(),
  itemType: refileItemTypeEnum("item_type").notNull(),
  itemId: uuid("item_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Dette d'avance (« avancer une fiche de demain ») : slot de la date visée perdu
  // inconditionnellement, à distinguer d'un report normal.
  avance: boolean("avance").notNull().default(false),
});

export const refileItem = pgTable("refile_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: date("date").notNull(),
  itemType: refileItemTypeEnum("item_type").notNull(),
  itemId: uuid("item_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Ordre manuel de la file d'un jour : tableau ordonné de clés d'items.
export const queueOrder = pgTable("queue_order", {
  date: date("date").primaryKey(),
  order: jsonb("order").notNull(),
});

// --- Régularité (IMPLEMENT_SCHEDULE.md §3) — mono-utilisateur ---

export const deadline = pgTable("deadline", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id").references(() => subject.id),
  type: deadlineTypeEnum("type").notNull(),
  libelle: text("libelle").notNull(),
  dueDate: date("due_date").notNull(),
  coefficient: real("coefficient"),
  dureeMin: integer("duree_min"),
  // Récurrences dépliées à la création (une ligne par occurrence).
  recurrenceGroupId: uuid("recurrence_group_id"),
  ackAt: timestamp("ack_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alert = pgTable(
  "alert",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: alertTypeEnum("type").notNull(),
    deadlineId: uuid("deadline_id").references(() => deadline.id),
    dateRef: date("date_ref").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    snoozedUntil: date("snoozed_until"),
  },
  (t) => [
    // Idempotence de generateAlerts : une alerte par (type, jour, deadline).
    uniqueIndex("alert_dedupe").on(
      t.type,
      t.dateRef,
      sql`coalesce(${t.deadlineId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
  ],
);

// Streak freeze : une ligne = un jour protégé.
export const serieGel = pgTable("serie_gel", {
  date: date("date").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
