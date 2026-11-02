import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { errorEntry, tentative, subject } from "@/db/schema";
import { loadOwnedFiche } from "./ownership";
import type { ErreurType } from "@/core/fiche/verdict";

// ErrorService : le carnet d'erreurs. Ajout manuel depuis la comparaison
// (`addManual`), rappel des erreurs connues d'une fiche (`activeForFiche`), CRUD.

const MAX_ERREURS_ACTIVES_AFFICHEES = 20; // ponytail: plafond arbitraire, la liste reste lisible

async function assertErrorOwnership(errorId: string, userId: string) {
  const err = await db.query.errorEntry.findFirst({ where: eq(errorEntry.id, errorId) });
  if (!err) throw new Error("Erreur introuvable.");
  const subj = await db.query.subject.findFirst({ where: eq(subject.id, err.subjectId) });
  if (!subj || subj.userId !== userId) throw new Error("Erreur introuvable.");
  return err;
}

export async function activeForFiche(ficheId: string) {
  return db.query.errorEntry.findMany({
    where: and(eq(errorEntry.ficheId, ficheId), eq(errorEntry.statut, "active")),
    limit: MAX_ERREURS_ACTIVES_AFFICHEES,
  });
}

// Ajout manuel depuis l'écran de comparaison : l'étudiant consigne une erreur
// qu'il vient de constater, rattachée à sa tentative (et donc à la fiche).
export async function addManual(
  userId: string,
  tentativeId: string,
  input: { type: ErreurType; description: string },
) {
  const t = await db.query.tentative.findFirst({ where: eq(tentative.id, tentativeId) });
  if (!t) throw new Error("Tentative introuvable.");
  const { subject: subj } = await loadOwnedFiche(t.ficheId, userId);
  const [created] = await db
    .insert(errorEntry)
    .values({ subjectId: subj.id, ficheId: t.ficheId, tentativeId: t.id, ...input })
    .returning();
  return created;
}

export interface ErrorListFilters {
  subjectId?: string;
  statut?: "active" | "resolue";
  type?: ErreurType;
  ficheId?: string;
  /** Pagination du carnet — omis = pas de limite. */
  limit?: number;
  offset?: number;
}

// Filtres matière/statut/type/fiche — toujours scopé aux matières de l'utilisateur
// (error_entry ne porte pas le userId, résolu via subject.user_id).
export async function list(userId: string, filters: ErrorListFilters = {}) {
  let subjectIds: string[];
  if (filters.subjectId) {
    const subj = await db.query.subject.findFirst({ where: eq(subject.id, filters.subjectId) });
    if (!subj || subj.userId !== userId) return [];
    subjectIds = [filters.subjectId];
  } else {
    const subjects = await db.query.subject.findMany({ where: eq(subject.userId, userId) });
    subjectIds = subjects.map((s) => s.id);
  }
  if (subjectIds.length === 0) return [];

  const conditions = [inArray(errorEntry.subjectId, subjectIds)];
  if (filters.statut) conditions.push(eq(errorEntry.statut, filters.statut));
  if (filters.type) conditions.push(eq(errorEntry.type, filters.type));
  if (filters.ficheId) conditions.push(eq(errorEntry.ficheId, filters.ficheId));

  return db.query.errorEntry.findMany({
    where: and(...conditions),
    orderBy: (e, { desc }) => [desc(e.createdAt)],
    limit: filters.limit,
    offset: filters.offset,
  });
}

export async function resolve(userId: string, errorId: string) {
  await assertErrorOwnership(errorId, userId);
  const [updated] = await db
    .update(errorEntry)
    .set({ statut: "resolue" })
    .where(eq(errorEntry.id, errorId))
    .returning();
  return updated;
}

// Symétrique de `resolve` : corrige un clic accidentel sur [Résolue].
export async function reopen(userId: string, errorId: string) {
  await assertErrorOwnership(errorId, userId);
  const [updated] = await db
    .update(errorEntry)
    .set({ statut: "active" })
    .where(eq(errorEntry.id, errorId))
    .returning();
  return updated;
}

export async function edit(
  userId: string,
  errorId: string,
  input: { type?: ErreurType; description?: string },
) {
  await assertErrorOwnership(errorId, userId);
  const [updated] = await db.update(errorEntry).set(input).where(eq(errorEntry.id, errorId)).returning();
  return updated;
}

// « Erreur créée à tort » : suppression réelle (une erreur n'a pas de dépendants).
export async function deleteEntry(userId: string, errorId: string) {
  await assertErrorOwnership(errorId, userId);
  await db.delete(errorEntry).where(eq(errorEntry.id, errorId));
  return { ok: true as const };
}
