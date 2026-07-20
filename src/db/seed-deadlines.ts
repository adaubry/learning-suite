import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";
import { deadline } from "./schema.ts";

// db/index.ts non importable ici (imports sans extension, convention bundler
// Next.js) — même client recréé à l'identique que src/db/seed.ts.
const db = drizzle(postgres(process.env.DATABASE_URL!), { schema });

// IMPLEMENT_SCHEDULE.md §3 : seed des échéances S3/S4 depuis la maquette du
// cursus, dates PLACEHOLDER que l'utilisateur corrige ensuite via l'écran
// Régularité (DeadlineChecklist). Pas de subjectId (aucune matière connue de
// ce script) : à assigner dans l'UI, en même temps que la vraie date.
//
// ponytail: le nombre de séances de CC TD n'est pas précisé par la spec
// (« dépliées semaine par semaine ») — 10 occurrences placeholder (un semestre
// type), à ajuster/compléter via [Ajouter]/suppression dans l'UI.
//
// Usage : npm run db:seed-deadlines (mono-utilisateur, `deadline` n'a pas de
// userId — ADR 6, même doctrine que DeferralLog/RefileItem/QueueOrder).

function placeholderDate(weeksFromNow: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + weeksFromNow * 7);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const rows: (typeof deadline.$inferInsert)[] = [];

  for (let i = 1; i <= 2; i++) {
    rows.push({
      type: "examen",
      libelle: `Écrit 3h #${i}`,
      dueDate: placeholderDate(10 + i * 2),
      coefficient: 2,
      dureeMin: 180,
    });
  }

  for (let i = 1; i <= 4; i++) {
    rows.push({
      type: "examen",
      libelle: `Écrit/oral 1h30 #${i}`,
      dueDate: placeholderDate(11 + i * 2),
      coefficient: 1,
      dureeMin: 90,
    });
  }

  rows.push({
    type: "examen",
    libelle: "Anglais",
    dueDate: placeholderDate(12),
    coefficient: 1,
    dureeMin: 90,
  });

  const ccGroupId = crypto.randomUUID();
  for (let semaine = 1; semaine <= 10; semaine++) {
    rows.push({
      type: "controle_continu",
      libelle: `CC TD séance ${semaine}`,
      dueDate: placeholderDate(semaine),
      recurrenceGroupId: ccGroupId,
    });
  }

  await db.insert(deadline).values(rows);
  console.log(`${rows.length} échéances placeholder insérées — à corriger via l'écran Régularité.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
