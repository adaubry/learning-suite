import { sql } from "drizzle-orm";
import {
  pgSchema,
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  smallint,
  real,
  boolean,
  date,
  timestamp,
  jsonb,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ponytail: pas de table `User` domaine — Supabase Auth possède déjà auth.users,
// on référence directement cette table (mono-utilisateur, doctrine simplicité §1).
const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

// --- Enums (ARCHITECTURE.md §8) ---

export const subjectStatutEnum = pgEnum("subject_statut", ["active", "archivee"]);
export const chapterStatutEnum = pgEnum("chapter_statut", ["actif", "archive"]);
export const sectionStatutEnum = pgEnum("section_statut", [
  "importee",
  "a_trier",
  "active",
  "exclue",
  "rubrique_a_valider",
  "prete",
  "validee",
  "en_revision",
  "archivee",
]);
export const correctionGuideStatutEnum = pgEnum("correction_guide_statut", [
  "a_valider",
  "valide",
  "obsolete",
]);
export const studyCycleTypeEnum = pgEnum("study_cycle_type", ["etude", "revision"]);
export const studyCycleEtatEnum = pgEnum("study_cycle_etat", [
  "rubrique_a_valider",
  "blurting",
  "correction",
  "feynman",
  "bilan",
  "clos",
]);
export const studySessionTypeEnum = pgEnum("study_session_type", [
  "blurting",
  "feynman",
  "revision",
]);
export const verdictEnum = pgEnum("verdict", ["acquis", "insuffisant"]);
export const noteFsrsEnum = pgEnum("note_fsrs", ["again", "hard", "good", "easy"]);
export const divulgationEnum = pgEnum("divulgation", ["controlee", "complete"]);
export const errorEntryTypeEnum = pgEnum("error_entry_type", [
  "omission",
  "deformation",
  "confusion",
  "imprecision",
]);
export const errorEntryStatutEnum = pgEnum("error_entry_statut", ["active", "resolue"]);
export const refileItemTypeEnum = pgEnum("refile_item_type", ["revision", "etude"]);
export const auditEventTypeEnum = pgEnum("audit_event_type", [
  "override_verdict",
  "revelation_correction",
  "report",
  "acquittement_anomalie",
  "validation_sur_insuffisant",
]);
export const promptLogAppelEnum = pgEnum("prompt_log_appel", [
  "sectionnement",
  "rubrique",
  "correction_erreurs",
  "feynman",
  "transcription",
]);
export const promptLogStatutEnum = pgEnum("prompt_log_statut", ["ok", "retry", "echec"]);

// --- Tables (ARCHITECTURE.md §8) ---

export const plannerConfig = pgTable("planner_config", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => authUsers.id),
  nouvellesParJour: integer("nouvelles_par_jour").notNull().default(3),
});

export const subject = pgTable("subject", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id),
  nom: text("nom").notNull(),
  semestre: text("semestre").notNull(),
  ordre: integer("ordre").notNull(),
  dateExamen: date("date_examen"),
  statut: subjectStatutEnum("statut").notNull().default("active"),
  methodologieTitres: text("methodologie_titres"),
});

export const chapter = pgTable("chapter", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subject.id),
  titre: text("titre").notNull(),
  markdown: text("markdown").notNull(),
  version: integer("version").notNull().default(1),
  contentHash: text("content_hash").notNull(),
  maj: timestamp("maj", { withTimezone: true }).notNull().defaultNow(),
  statut: chapterStatutEnum("statut").notNull().default("actif"),
});

export const section = pgTable(
  "section",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => chapter.id),
    chapterVersion: integer("chapter_version").notNull(),
    titre: text("titre").notNull(),
    ordre: integer("ordre").notNull(),
    niveauSource: smallint("niveau_source").notNull(),
    contenu: text("contenu").notNull(),
    segmentsGras: jsonb("segments_gras"),
    commentaires: jsonb("commentaires"),
    importance: smallint("importance").notNull(),
    statut: sectionStatutEnum("statut").notNull().default("importee"),
    parentIds: uuid("parent_ids").array(),
  },
  (t) => [check("importance_range", sql`${t.importance} BETWEEN 1 AND 5`)],
);

export const correctionGuide = pgTable(
  "correction_guide",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => section.id),
    chapterVersion: integer("chapter_version").notNull(),
    contenu: jsonb("contenu").notNull(),
    statut: correctionGuideStatutEnum("statut").notNull().default("a_valider"),
    valideLe: timestamp("valide_le", { withTimezone: true }),
  },
  (t) => [
    // un seul CorrectionGuide non-obsolète par section (ARCHITECTURE §8)
    uniqueIndex("correction_guide_section_non_obsolete")
      .on(t.sectionId)
      .where(sql`${t.statut} <> 'obsolete'`),
  ],
);

export const studyCycle = pgTable(
  "study_cycle",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => section.id),
    type: studyCycleTypeEnum("type").notNull(),
    etat: studyCycleEtatEnum("etat").notNull().default("rubrique_a_valider"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // une seule session ouverte par utilisateur (S4, FUNCTIONS §7)
    uniqueIndex("study_cycle_one_open_per_user")
      .on(t.userId)
      .where(sql`${t.closedAt} IS NULL`),
  ],
);

export const studySession = pgTable("study_session", {
  id: uuid("id").primaryKey().defaultRandom(),
  cycleId: uuid("cycle_id")
    .notNull()
    .references(() => studyCycle.id),
  sectionId: uuid("section_id")
    .notNull()
    .references(() => section.id),
  guideId: uuid("guide_id")
    .notNull()
    .references(() => correctionGuide.id),
  chapterVersion: integer("chapter_version").notNull(),
  type: studySessionTypeEnum("type").notNull(),
  tentative: integer("tentative").notNull(),
  input: text("input").notNull(),
  correction: jsonb("correction"),
  verdictLlm: verdictEnum("verdict_llm"),
  verdictFinal: verdictEnum("verdict_final"),
  override: boolean("override").notNull().default(false),
  noteFsrs: noteFsrsEnum("note_fsrs"),
  divulgation: divulgationEnum("divulgation").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const errorEntry = pgTable("error_entry", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subject.id),
  sectionId: uuid("section_id")
    .notNull()
    .references(() => section.id),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => studySession.id),
  type: errorEntryTypeEnum("type").notNull(),
  description: text("description").notNull(),
  statut: errorEntryStatutEnum("statut").notNull().default("active"),
  occurrences: integer("occurrences").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviewCard = pgTable("review_card", {
  id: uuid("id").primaryKey().defaultRandom(),
  sectionId: uuid("section_id")
    .notNull()
    .unique()
    .references(() => section.id),
  due: date("due").notNull(),
  stability: real("stability").notNull(),
  difficulty: real("difficulty").notNull(),
  reps: integer("reps").notNull().default(0),
  lapses: integer("lapses").notNull().default(0),
  lastReview: timestamp("last_review", { withTimezone: true }),
  // gel (FUNCTIONS §7, ARCHITECTURE v0.6) : seul champ que S6.freeze/unfreeze
  // possède — le futur S5 (Bloc 6.3) filtrera `gelee = false` avant P7.
  gelee: boolean("gelee").notNull().default(false),
});

// ponytail: DeferralLog/RefileItem/AuditEvent référencent item_id/entite_id de
// façon polymorphe (type discriminé par item_type/entite_type) — pas de FK
// possible en SQL déclaratif sur une cible polymorphe, assumé.

export const deferralLog = pgTable("deferral_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: date("date").notNull(),
  itemType: refileItemTypeEnum("item_type").notNull(),
  itemId: uuid("item_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const refileItem = pgTable("refile_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: date("date").notNull(),
  itemType: refileItemTypeEnum("item_type").notNull(),
  itemId: uuid("item_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// S5.reorder (FUNCTIONS §3, §7 « purge de l'ordre manuel ») : une permutation
// datée de la file du jour — mono-utilisateur (ADR 6), même doctrine que
// DeferralLog/RefileItem ci-dessus (pas de user_id, un seul utilisateur).
// `order` : tableau ordonné de {kind, id} (QueueItem sans les champs dérivés).
export const queueOrder = pgTable("queue_order", {
  date: date("date").primaryKey(),
  order: jsonb("order").notNull(),
});

export const auditEvent = pgTable("audit_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: auditEventTypeEnum("type").notNull(),
  entiteType: text("entite_type").notNull(),
  entiteId: uuid("entite_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const promptConfig = pgTable("prompt_config", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => authUsers.id),
  methodologieTitresGlobale: text("methodologie_titres_globale"),
});

export const promptLog = pgTable("prompt_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  appel: promptLogAppelEnum("appel").notNull(),
  promptVersion: text("prompt_version").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  dureeMs: integer("duree_ms").notNull(),
  statut: promptLogStatutEnum("statut").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
