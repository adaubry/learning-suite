import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { subject, plannerConfig, promptConfig } from "@/db/schema";

// S9 · AccountService — partiel (FUNCTIONS §3) : CRUD matières, rythme, méthodologie globale.
// Suppression dure hors scope (archivage seul — É6.4 n'est pas construit).

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

async function setSubjectStatut(userId: string, subjectId: string, statut: "active" | "archivee") {
  const [updated] = await db
    .update(subject)
    .set({ statut })
    .where(and(eq(subject.id, subjectId), eq(subject.userId, userId)))
    .returning();
  return updated;
}

export const archiveSubject = (userId: string, subjectId: string) =>
  setSubjectStatut(userId, subjectId, "archivee");

export const unarchiveSubject = (userId: string, subjectId: string) =>
  setSubjectStatut(userId, subjectId, "active");

export async function getPlannerConfig(userId: string) {
  const row = await db.query.plannerConfig.findFirst({
    where: eq(plannerConfig.userId, userId),
  });
  return row ?? { userId, nouvellesParJour: 3 };
}

export async function updatePlannerConfig(userId: string, nouvellesParJour: number) {
  const [row] = await db
    .insert(plannerConfig)
    .values({ userId, nouvellesParJour })
    .onConflictDoUpdate({ target: plannerConfig.userId, set: { nouvellesParJour } })
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
