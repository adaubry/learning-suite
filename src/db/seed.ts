import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";
import { plannerConfig, subject, chapter, section, correctionGuide, reviewCard } from "./schema.ts";

// db/index.ts n'est pas importable tel quel ici : ses imports relatifs sans
// extension (convention Next.js/bundler) ne résolvent pas sous l'ESM natif de
// Node (`--experimental-strip-types`, aucun bundler) — même client recréé à
// l'identique plutôt que de changer les extensions d'un fichier partagé pour
// un besoin d'outillage qui lui est propre.
const db = drizzle(postgres(process.env.DATABASE_URL!), { schema });

// Bloc 9.3 — seed de démo (PLAN.md Phase 9). Script CLI seul (jamais une Server
// Action/route) : peuple le compte de l'utilisateur donné avec des matières,
// chapitres et sections dans divers états (à trier, rubrique à valider, prête,
// en révision due/à venir) pour développer/démontrer l'app sans repasser par
// l'import + sectionnement + génération de rubrique à chaque fois.
//
// Usage : npm run db:seed -- <userId Supabase>
//
// ponytail: pas d'idempotence — relancer le script ajoute de nouvelles lignes.
// Un dev qui veut repartir de zéro nettoie sa base locale (db:studio ou SQL direct).

const userId = process.argv[2];
if (!userId) {
  console.error("Usage: npm run db:seed -- <userId>");
  process.exit(1);
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function point(type: "critique" | "important" | "secondaire", intitule: string, attendu: string) {
  return { type, intitule, attendu, piege_associe: null, segments_couverts: [] };
}

async function insertChapter(subjectId: string, titre: string) {
  const [c] = await db
    .insert(chapter)
    .values({ subjectId, titre, markdown: `# ${titre}\n\nContenu de démo.`, contentHash: `demo-${crypto.randomUUID()}` })
    .returning();
  return c.id;
}

async function insertSection(
  chapterId: string,
  titre: string,
  statut: (typeof section.$inferInsert)["statut"],
  importance: number,
  ordre: number,
) {
  const [s] = await db
    .insert(section)
    .values({ chapterId, chapterVersion: 1, titre, ordre, niveauSource: 2, contenu: `Contenu de démo — ${titre}.`, importance, statut })
    .returning();
  return s.id;
}

async function insertGuide(sectionId: string, statut: "a_valider" | "valide") {
  await db.insert(correctionGuide).values({
    sectionId,
    chapterVersion: 1,
    statut,
    valideLe: statut === "valide" ? new Date() : null,
    contenu: {
      points: [
        point("critique", "Notion clé", "Définir la notion clé de la section."),
        point("important", "Exception", "Citer l'exception principale."),
      ],
    },
  });
}

async function insertReviewCard(sectionId: string, due: string) {
  await db.insert(reviewCard).values({ sectionId, due, stability: 3, difficulty: 5, reps: 1, lapses: 0 });
}

async function main() {
  await db.insert(plannerConfig).values({ userId }).onConflictDoNothing();

  const [droitCivil] = await db
    .insert(subject)
    .values({ userId, nom: "Droit civil — Les obligations", semestre: "S1", ordre: 1, dateExamen: daysFromNow(20) })
    .returning();
  const chap1 = await insertChapter(droitCivil.id, "Les sources du droit");
  await insertSection(chap1, "La loi", "a_trier", 3, 1);
  await insertSection(chap1, "La coutume", "active", 4, 2);
  const aValider = await insertSection(chap1, "La jurisprudence", "rubrique_a_valider", 4, 3);
  await insertGuide(aValider, "a_valider");
  const prete = await insertSection(chap1, "La doctrine", "prete", 5, 4);
  await insertGuide(prete, "valide");
  const enRevisionDue = await insertSection(chap1, "Les principes généraux du droit", "en_revision", 3, 5);
  await insertGuide(enRevisionDue, "valide");
  await insertReviewCard(enRevisionDue, daysFromNow(-1));

  const [droitConstit] = await db
    .insert(subject)
    .values({ userId, nom: "Droit constitutionnel", semestre: "S1", ordre: 2, dateExamen: daysFromNow(90) })
    .returning();
  const chap2 = await insertChapter(droitConstit.id, "La séparation des pouvoirs");
  const enRevisionFutur = await insertSection(chap2, "Le pouvoir exécutif", "en_revision", 3, 1);
  await insertGuide(enRevisionFutur, "valide");
  await insertReviewCard(enRevisionFutur, daysFromNow(5));

  const [droitObligationsArchivable] = await db
    .insert(subject)
    .values({ userId, nom: "Droit des obligations (S1 passé)", semestre: "S1", ordre: 3, dateExamen: daysFromNow(-30) })
    .returning();
  const chap3 = await insertChapter(droitObligationsArchivable.id, "La responsabilité civile");
  const revolu = await insertSection(chap3, "La responsabilité délictuelle", "en_revision", 4, 1);
  await insertGuide(revolu, "valide");
  await insertReviewCard(revolu, daysFromNow(10));

  console.log("Seed de démo inséré pour l'utilisateur", userId);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
