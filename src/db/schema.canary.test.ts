import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// ponytail: canaris déterministes (aucun LLM) — gardent les invariants
// structurels du schéma (FUNCTIONS §7, ARCHITECTURE §8), verts en permanence.

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client, { schema });

// user/session/account/verification (src/db/auth-schema.ts) volontairement
// exclues : générées par la CLI Better-Auth, jamais éditées à la main (même
// doctrine que les composants shadcn vendored, TECH_MAPPING §0) — hors
// périmètre de ce canari structurel.
const EXPECTED_COLUMNS: Record<string, string[]> = {
  planner_config: [
    "user_id",
    "nouvelles_par_jour",
    "tts_active",
    "debut_s3",
    "debut_s4",
    "gels_serie_restants",
    "heure_alerte_serie",
    "seuil_dette_reports",
  ],
  subject: [
    "id",
    "user_id",
    "nom",
    "semestre",
    "ordre",
    "date_examen",
    "statut",
    "methodologie_titres",
    "archived_at",
  ],
  chapter: ["id", "subject_id", "titre", "markdown", "version", "content_hash", "maj", "statut", "archived_at"],
  section: [
    "id",
    "chapter_id",
    "chapter_version",
    "titre",
    "ordre",
    "niveau_source",
    "contenu",
    "segments_gras",
    "commentaires",
    "importance",
    "statut",
    "parent_ids",
  ],
  correction_guide: ["id", "section_id", "chapter_version", "contenu", "statut", "valide_le"],
  study_cycle: ["id", "user_id", "section_id", "type", "etat", "bilan_feynman", "closed_at", "created_at"],
  study_session: [
    "id",
    "cycle_id",
    "section_id",
    "guide_id",
    "chapter_version",
    "type",
    "tentative",
    "input",
    "correction",
    "verdict_llm",
    "verdict_final",
    "override",
    "note_fsrs",
    "divulgation",
    "created_at",
  ],
  error_entry: [
    "id",
    "subject_id",
    "section_id",
    "session_id",
    "type",
    "description",
    "statut",
    "occurrences",
    "created_at",
  ],
  review_card: ["id", "section_id", "due", "stability", "difficulty", "reps", "lapses", "last_review", "gelee"],
  deferral_log: ["id", "date", "item_type", "item_id", "created_at", "avance"],
  refile_item: ["id", "date", "item_type", "item_id", "created_at"],
  queue_order: ["date", "order"],
  audit_event: ["id", "type", "entite_type", "entite_id", "created_at"],
  prompt_config: ["user_id", "methodologie_titres_globale"],
  prompt_log: [
    "id",
    "appel",
    "prompt_version",
    "model",
    "input_tokens",
    "output_tokens",
    "duree_ms",
    "statut",
    "created_at",
  ],
  deadline: [
    "id",
    "subject_id",
    "type",
    "libelle",
    "due_date",
    "coefficient",
    "duree_min",
    "recurrence_group_id",
    "ack_at",
    "created_at",
  ],
  alert: [
    "id",
    "type",
    "deadline_id",
    "date_ref",
    "payload",
    "created_at",
    "dismissed_at",
    "snoozed_until",
  ],
  serie_gel: ["date", "created_at"],
};

let userId: string;
let subjectId: string;
let chapterId: string;
let sectionId: string;

beforeAll(async () => {
  const [user] = await client`
    insert into "user" (name, email) values ('Test', gen_random_uuid()::text || '@example.com') returning id
  `;
  userId = user.id;

  [{ id: subjectId }] = await db
    .insert(schema.subject)
    .values({ userId, nom: "Test", semestre: "S1", ordre: 1 })
    .returning({ id: schema.subject.id });

  [{ id: chapterId }] = await db
    .insert(schema.chapter)
    .values({ subjectId, titre: "Chap", markdown: "# x", contentHash: "h" })
    .returning({ id: schema.chapter.id });

  [{ id: sectionId }] = await db
    .insert(schema.section)
    .values({
      chapterId,
      chapterVersion: 1,
      titre: "Sec",
      ordre: 1,
      niveauSource: 1,
      contenu: "...",
      importance: 3,
    })
    .returning({ id: schema.section.id });
});

afterAll(async () => {
  await db.delete(schema.studyCycle).where(eq(schema.studyCycle.sectionId, sectionId));
  await db.delete(schema.reviewCard).where(eq(schema.reviewCard.sectionId, sectionId));
  await db.delete(schema.correctionGuide).where(eq(schema.correctionGuide.sectionId, sectionId));
  await db.delete(schema.section).where(eq(schema.section.id, sectionId));
  await db.delete(schema.chapter).where(eq(schema.chapter.id, chapterId));
  await db.delete(schema.subject).where(eq(schema.subject.id, subjectId));
  await client`delete from "user" where id = ${userId}`;
  await client.end();
});

describe("intégrité du schéma migré (ARCHITECTURE §8)", () => {
  it("chaque table attendue a exactement les colonnes documentées", async () => {
    const rows = await client<{ table_name: string; column_name: string }[]>`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = ANY(${Object.keys(EXPECTED_COLUMNS)})
    `;

    const actual: Record<string, Set<string>> = {};
    for (const { table_name, column_name } of rows) {
      (actual[table_name] ??= new Set()).add(column_name);
    }

    for (const [table, columns] of Object.entries(EXPECTED_COLUMNS)) {
      expect(actual[table], `table manquante : ${table}`).toBeDefined();
      expect(actual[table], `colonnes de ${table}`).toEqual(new Set(columns));
    }
  });
});

describe("contraintes DB (FUNCTIONS §7)", () => {
  it("une seule ReviewCard par section", async () => {
    await db.insert(schema.reviewCard).values({
      sectionId,
      due: "2026-01-01",
      stability: 1,
      difficulty: 1,
    });

    await expect(
      db.insert(schema.reviewCard).values({
        sectionId,
        due: "2026-01-02",
        stability: 1,
        difficulty: 1,
      }),
    ).rejects.toThrow();
  });

  // dépend de l'ordre : aucune CorrectionGuide valide n'existe encore pour
  // sectionId à ce stade (créée par le test suivant).
  it("interdit une étude sans rubrique valide", async () => {
    await expect(
      db.insert(schema.studyCycle).values({ userId, sectionId, type: "etude" }),
    ).rejects.toThrow();
  });

  it("@canary deux StudyCycle ouverts pour le même utilisateur : le second échoue", async () => {
    await db.insert(schema.correctionGuide).values({
      sectionId,
      chapterVersion: 1,
      contenu: {},
      statut: "valide",
    });

    await db.insert(schema.studyCycle).values({ userId, sectionId, type: "etude" });

    await expect(
      db.insert(schema.studyCycle).values({ userId, sectionId, type: "etude" }),
    ).rejects.toThrow();
  });
});
