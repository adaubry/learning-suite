import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { client, cleanupAll, seedSet } from "@/test/fixtures";

// @canary — invariants structurels du schéma v2 (ARCHITECTURE.md §4, §8),
// déterministes, verts en permanence.

const db = drizzle(client, { schema });

// Tables Better-Auth (user/session/account/verification) exclues : générées.
const EXPECTED_COLUMNS: Record<string, string[]> = {
  planner_config: [
    "user_id",
    "nouvelles_par_jour",
    "debut_s3",
    "debut_s4",
    "gels_serie_restants",
    "heure_alerte_serie",
    "seuil_dette_reports",
  ],
  subject: ["id", "user_id", "nom", "semestre", "ordre", "date_examen", "statut", "archived_at"],
  fiche_set: ["id", "subject_id", "titre", "markdown", "imported_at", "created_at", "statut", "archived_at"],
  fiche: ["id", "set_id", "numero", "titre", "contenu", "content_hash", "statut"],
  review_card: ["id", "fiche_id", "due", "stability", "difficulty", "reps", "lapses", "last_review", "gelee"],
  study_cycle: ["id", "user_id", "fiche_id", "type", "etat", "note", "closed_at", "created_at"],
  tentative: ["id", "cycle_id", "fiche_id", "fiche_hash", "numero", "input", "correction", "verdict", "created_at"],
  error_entry: [
    "id",
    "subject_id",
    "fiche_id",
    "tentative_id",
    "type",
    "description",
    "statut",
    "occurrences",
    "created_at",
  ],
  deferral_log: ["id", "date", "item_type", "item_id", "created_at", "avance"],
  refile_item: ["id", "date", "item_type", "item_id", "created_at"],
  queue_order: ["date", "order"],
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
  alert: ["id", "type", "deadline_id", "date_ref", "payload", "created_at", "dismissed_at", "snoozed_until"],
  serie_gel: ["date", "created_at"],
};

let userId: string;
let ficheId: string;

beforeAll(async () => {
  const seeded = await seedSet();
  userId = seeded.userId;
  ficheId = seeded.fiches[0].id;
});

afterAll(cleanupAll);

describe("intégrité du schéma v2 (@canary)", () => {
  it("chaque table attendue a exactement les colonnes documentées, et aucune table v1 ne subsiste", async () => {
    const rows = await client<{ table_name: string; column_name: string }[]>`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and table_name = ANY(${Object.keys(EXPECTED_COLUMNS)})
    `;
    const actual: Record<string, Set<string>> = {};
    for (const { table_name, column_name } of rows) (actual[table_name] ??= new Set()).add(column_name);
    for (const [table, columns] of Object.entries(EXPECTED_COLUMNS)) {
      expect(actual[table], `colonnes de ${table}`).toEqual(new Set(columns));
    }

    const v1 = await client`
      select table_name from information_schema.tables where table_schema = 'public'
      and table_name in ('chapter', 'section', 'correction_guide', 'study_session', 'audit_event', 'prompt_config', 'prompt_log')
    `;
    expect(v1).toEqual([]);
  });
});

describe("contraintes DB (@canary)", () => {
  it("une seule ReviewCard par fiche", async () => {
    await db.insert(schema.reviewCard).values({ ficheId, due: "2026-01-01", stability: 1, difficulty: 1 });
    await expect(
      db.insert(schema.reviewCard).values({ ficheId, due: "2026-01-02", stability: 1, difficulty: 1 }),
    ).rejects.toThrow();
  });

  it("deux StudyCycle ouverts pour le même utilisateur : le second échoue", async () => {
    await db.insert(schema.studyCycle).values({ userId, ficheId, type: "etude", etat: "lecture" });
    await expect(
      db.insert(schema.studyCycle).values({ userId, ficheId, type: "etude", etat: "lecture" }),
    ).rejects.toThrow();
  });
});
