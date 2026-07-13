import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  subject,
  chapter,
  section,
  correctionGuide,
  reviewCard,
  studyCycle,
  studySession,
  errorEntry,
  plannerConfig,
  promptConfig,
} from "@/db/schema";
import * as chapterService from "./chapter";
import * as reviewService from "./review";

// S9 · AccountService (FUNCTIONS §3) : CRUD matières, rythme, méthodologie globale,
// suppression gardée (Bloc 9.1, réutilise S1.deleteChapter), export complet.

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
  input: Partial<{
    nom: string;
    semestre: string;
    dateExamen: string | null;
    methodologieTitres: string | null;
  }>,
) {
  const [updated] = await db
    .update(subject)
    .set(input)
    .where(and(eq(subject.id, subjectId), eq(subject.userId, userId)))
    .returning();
  return updated;
}

// Sections des chapitres ACTIFS de la matière (Bloc 9.1 fix, USER_FLOW É6.4) — un
// chapitre déjà archivé individuellement garde son propre gel, non re-touché ici
// (évite un double décalage de `due` quand matière et chapitre sont archivés/
// désarchivés indépendamment).
async function activeSectionIdsOf(subjectId: string) {
  const chapters = await db.query.chapter.findMany({
    where: and(eq(chapter.subjectId, subjectId), eq(chapter.statut, "actif")),
    columns: { id: true },
  });
  if (chapters.length === 0) return [];
  const sections = await db.query.section.findMany({
    where: inArray(section.chapterId, chapters.map((c) => c.id)),
    columns: { id: true },
  });
  return sections.map((s) => s.id);
}

export async function archiveSubject(userId: string, subjectId: string) {
  const [updated] = await db
    .update(subject)
    .set({ statut: "archivee", archivedAt: new Date() })
    .where(and(eq(subject.id, subjectId), eq(subject.userId, userId)))
    .returning();
  if (!updated) return updated;

  for (const sectionId of await activeSectionIdsOf(subjectId)) {
    await reviewService.freeze(userId, sectionId);
  }
  return updated;
}

export async function unarchiveSubject(userId: string, subjectId: string) {
  const owned = await db.query.subject.findFirst({
    where: and(eq(subject.id, subjectId), eq(subject.userId, userId)),
  });

  const [updated] = await db
    .update(subject)
    .set({ statut: "active", archivedAt: null })
    .where(and(eq(subject.id, subjectId), eq(subject.userId, userId)))
    .returning();

  for (const sectionId of await activeSectionIdsOf(subjectId)) {
    await reviewService.unfreeze(userId, sectionId, owned?.archivedAt ?? null);
  }
  return updated;
}

// delete (FUNCTIONS §3 S9, USER_FLOW É6.4) : suppression gardée — détruit l'historique de
// chaque chapitre de la matière via S1.deleteChapter (même cascade ordonnée, pas de logique
// dupliquée), puis la matière elle-même.
export async function deleteSubject(userId: string, subjectId: string) {
  const owned = await db.query.subject.findFirst({ where: eq(subject.id, subjectId) });
  if (!owned || owned.userId !== userId) throw new Error("Matière introuvable.");

  const chapters = await db.query.chapter.findMany({
    where: eq(chapter.subjectId, subjectId),
    columns: { id: true },
  });
  for (const c of chapters) {
    await chapterService.deleteChapter(userId, c.id);
  }
  await db.delete(subject).where(eq(subject.id, subjectId));
}

export async function getPlannerConfig(userId: string) {
  const row = await db.query.plannerConfig.findFirst({
    where: eq(plannerConfig.userId, userId),
  });
  return row ?? { userId, nouvellesParJour: 3, ttsActive: true };
}

export async function updatePlannerConfig(userId: string, nouvellesParJour: number) {
  const [row] = await db
    .insert(plannerConfig)
    .values({ userId, nouvellesParJour })
    .onConflictDoUpdate({ target: plannerConfig.userId, set: { nouvellesParJour } })
    .returning();
  return row;
}

// Réglages P7 (Bloc 9.1, USER_FLOW P7) : TTS on/off, persisté — FeynmanChat (Bloc 7.2) ne
// portait qu'un `useState` local, jamais un vrai réglage de compte.
export async function updateTtsActive(userId: string, ttsActive: boolean) {
  const [row] = await db
    .insert(plannerConfig)
    .values({ userId, ttsActive })
    .onConflictDoUpdate({ target: plannerConfig.userId, set: { ttsActive } })
    .returning();
  return row;
}

// dérivé de l'existence d'une ligne PlannerConfig — pas de colonne dédiée (DECISIONS.md)
export async function hasCompletedOnboarding(userId: string) {
  const row = await db.query.plannerConfig.findFirst({
    where: eq(plannerConfig.userId, userId),
  });
  return row !== undefined;
}

export async function getMethodologieGlobale(userId: string) {
  const row = await db.query.promptConfig.findFirst({
    where: eq(promptConfig.userId, userId),
  });
  return row?.methodologieTitresGlobale ?? null;
}

export async function updateMethodologieGlobale(
  userId: string,
  methodologieTitresGlobale: string | null,
) {
  const [row] = await db
    .insert(promptConfig)
    .values({ userId, methodologieTitresGlobale })
    .onConflictDoUpdate({
      target: promptConfig.userId,
      set: { methodologieTitresGlobale },
    })
    .returning();
  return row;
}

// exportUserData (FUNCTIONS §3 S9 : « JSON complet, archives et journaux compris ») — inclut
// les matières/chapitres archivés (aucun filtre de statut) et l'intégralité de auditEvent/
// promptLog : ces deux tables n'ont pas de user_id (doctrine mono-utilisateur, ADR 6 — même
// raison que DeferralLog/RefileItem/QueueOrder), il n'y a donc jamais qu'un seul utilisateur
// dont ces journaux pourraient parler.
export async function exportUserData(userId: string) {
  const subjects = await db.query.subject.findMany({ where: eq(subject.userId, userId) });
  const subjectIds = subjects.map((s) => s.id);
  const chapters = subjectIds.length
    ? await db.query.chapter.findMany({ where: inArray(chapter.subjectId, subjectIds) })
    : [];
  const chapterIds = chapters.map((c) => c.id);
  const sections = chapterIds.length
    ? await db.query.section.findMany({ where: inArray(section.chapterId, chapterIds) })
    : [];
  const sectionIds = sections.map((s) => s.id);

  const [correctionGuides, reviewCards, studyCycles, studySessions, errorEntries, plannerCfg] =
    await Promise.all([
      sectionIds.length
        ? db.query.correctionGuide.findMany({ where: inArray(correctionGuide.sectionId, sectionIds) })
        : [],
      sectionIds.length
        ? db.query.reviewCard.findMany({ where: inArray(reviewCard.sectionId, sectionIds) })
        : [],
      sectionIds.length
        ? db.query.studyCycle.findMany({ where: inArray(studyCycle.sectionId, sectionIds) })
        : [],
      sectionIds.length
        ? db.query.studySession.findMany({ where: inArray(studySession.sectionId, sectionIds) })
        : [],
      sectionIds.length
        ? db.query.errorEntry.findMany({ where: inArray(errorEntry.sectionId, sectionIds) })
        : [],
      getPlannerConfig(userId),
    ]);

  const [auditEvents, promptLogs, methodologieGlobale] = await Promise.all([
    db.query.auditEvent.findMany(),
    db.query.promptLog.findMany(),
    getMethodologieGlobale(userId),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    plannerConfig: plannerCfg,
    methodologieTitresGlobale: methodologieGlobale,
    subjects,
    chapters,
    sections,
    correctionGuides,
    reviewCards,
    studyCycles,
    studySessions,
    errorEntries,
    auditEvents,
    promptLogs,
  };
}
