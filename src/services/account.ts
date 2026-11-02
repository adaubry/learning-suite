import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  subject,
  ficheSet,
  fiche,
  reviewCard,
  studyCycle,
  tentative,
  errorEntry,
  plannerConfig,
} from "@/db/schema";
import * as ficheService from "./fiche";
import * as reviewService from "./review";

// AccountService : matières (CRUD, archivage, suppression gardée), réglages du
// planificateur, export complet.

export async function listSubjects(userId: string) {
  return db.query.subject.findMany({
    where: eq(subject.userId, userId),
    orderBy: (s, { asc }) => [asc(s.ordre)],
  });
}

export async function createSubject(
  userId: string,
  input: { nom: string; semestre: string; dateExamen?: string },
) {
  const [{ maxOrdre }] = await db
    .select({ maxOrdre: sql<number>`coalesce(max(${subject.ordre}), 0)` })
    .from(subject)
    .where(eq(subject.userId, userId));

  const [created] = await db
    .insert(subject)
    .values({
      userId,
      nom: input.nom,
      semestre: input.semestre,
      dateExamen: input.dateExamen ?? null,
      ordre: maxOrdre + 1,
    })
    .returning();
  return created;
}

export async function updateSubject(
  userId: string,
  subjectId: string,
  input: Partial<{ nom: string; semestre: string; dateExamen: string | null }>,
) {
  const [updated] = await db
    .update(subject)
    .set(input)
    .where(and(eq(subject.id, subjectId), eq(subject.userId, userId)))
    .returning();
  return updated;
}

export async function archiveSubject(userId: string, subjectId: string) {
  const [updated] = await db
    .update(subject)
    .set({ statut: "archivee", archivedAt: new Date() })
    .where(and(eq(subject.id, subjectId), eq(subject.userId, userId), eq(subject.statut, "active")))
    .returning();
  if (updated) await reviewService.freeze(await ficheService.ficheIdsOfActiveSets(subjectId));
  return updated;
}

export async function unarchiveSubject(userId: string, subjectId: string) {
  const owned = await db.query.subject.findFirst({
    where: and(eq(subject.id, subjectId), eq(subject.userId, userId)),
  });
  if (!owned || owned.statut === "active") return owned;

  const [updated] = await db
    .update(subject)
    .set({ statut: "active", archivedAt: null })
    .where(eq(subject.id, subjectId))
    .returning();
  await reviewService.unfreeze(await ficheService.ficheIdsOfActiveSets(subjectId), owned.archivedAt);
  return updated;
}

// Suppression gardée (double confirmation côté UI) : sets et historique compris.
export async function deleteSubject(userId: string, subjectId: string) {
  const owned = await db.query.subject.findFirst({ where: eq(subject.id, subjectId) });
  if (!owned || owned.userId !== userId) throw new Error("Matière introuvable.");

  const sets = await db.query.ficheSet.findMany({ where: eq(ficheSet.subjectId, subjectId), columns: { id: true } });
  await ficheService.deleteSetsUnchecked(sets.map((s) => s.id));
  await db.delete(subject).where(eq(subject.id, subjectId));
}

export async function getPlannerConfig(userId: string) {
  const row = await db.query.plannerConfig.findFirst({ where: eq(plannerConfig.userId, userId) });
  return (
    row ?? {
      userId,
      nouvellesParJour: 3,
      debutS3: null,
      debutS4: null,
      gelsSerieRestants: 2,
      heureAlerteSerie: "20:00",
      seuilDetteReports: 3,
    }
  );
}

// Régularité (IMPLEMENT_SCHEDULE.md §3) : debutS3/debutS4 configurés depuis l'écran Régularité.
export async function updateSemesterConfig(
  userId: string,
  input: Partial<{ debutS3: string | null; debutS4: string | null }>,
) {
  const [row] = await db
    .insert(plannerConfig)
    .values({ userId, ...input })
    .onConflictDoUpdate({ target: plannerConfig.userId, set: input })
    .returning();
  return row;
}

export async function updatePlannerConfig(userId: string, nouvellesParJour: number) {
  const [row] = await db
    .insert(plannerConfig)
    .values({ userId, nouvellesParJour })
    .onConflictDoUpdate({ target: plannerConfig.userId, set: { nouvellesParJour } })
    .returning();
  return row;
}

// Export JSON complet, archives comprises. prompt_log n'a pas de user_id
// (mono-utilisateur) : exporté en entier.
export async function exportUserData(userId: string) {
  const subjects = await db.query.subject.findMany({ where: eq(subject.userId, userId) });
  const subjectIds = subjects.map((s) => s.id);
  const sets = subjectIds.length
    ? await db.query.ficheSet.findMany({ where: inArray(ficheSet.subjectId, subjectIds) })
    : [];
  const setIds = sets.map((s) => s.id);
  const fiches = setIds.length ? await db.query.fiche.findMany({ where: inArray(fiche.setId, setIds) }) : [];
  const ficheIds = fiches.map((f) => f.id);

  const [reviewCards, studyCycles, tentatives, errorEntries, plannerCfg, promptLogs] = await Promise.all([
    ficheIds.length ? db.query.reviewCard.findMany({ where: inArray(reviewCard.ficheId, ficheIds) }) : [],
    ficheIds.length ? db.query.studyCycle.findMany({ where: inArray(studyCycle.ficheId, ficheIds) }) : [],
    ficheIds.length ? db.query.tentative.findMany({ where: inArray(tentative.ficheId, ficheIds) }) : [],
    ficheIds.length ? db.query.errorEntry.findMany({ where: inArray(errorEntry.ficheId, ficheIds) }) : [],
    getPlannerConfig(userId),
    db.query.promptLog.findMany(),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    version: 2,
    plannerConfig: plannerCfg,
    subjects,
    ficheSets: sets,
    fiches,
    reviewCards,
    studyCycles,
    tentatives,
    errorEntries,
    promptLogs,
  };
}
