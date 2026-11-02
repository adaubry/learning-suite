import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { errorEntry, tentative, subject } from "@/db/schema";
import { loadOwnedFiche } from "./ownership";
import type { CorrectionData } from "./session";
import type { ErreurType } from "@/core/fiche/verdict";

// ErrorService : le carnet d'erreurs. `activeForFiche` alimente la correction
// (détection de récidive) ; `commitCandidates` enregistre les erreurs candidates
// non rejetées quand on quitte l'écran de correction ; CRUD du carnet.

const MAX_ERREURS_ACTIVES_CONTEXTE = 20; // ponytail: plafond arbitraire, à ajuster si le contexte LLM déborde

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
    limit: MAX_ERREURS_ACTIVES_CONTEXTE,
  });
}

// Les candidates NON rejetées sont acceptées telles quelles (clic explicite ou
// simple sortie de l'écran : même résultat). Récidive (`idErreurExistante`) :
// incrémente `occurrences` au lieu de créer un doublon. Appelée une seule fois par
// tentative (relire ou noter, chacune sortie unique de son écran de correction).
export async function commitCandidates(userId: string, tentativeId: string, rejectedIndexes: number[] = []) {
  const t = await db.query.tentative.findFirst({ where: eq(tentative.id, tentativeId) });
  if (!t) throw new Error("Tentative introuvable.");
  const { subject: subj } = await loadOwnedFiche(t.ficheId, userId);

  const candidates = (t.correction as CorrectionData | null)?.erreursCandidates ?? [];
  const rejected = new Set(rejectedIndexes);

  for (const [index, candidate] of candidates.entries()) {
    if (rejected.has(index)) continue;
    if (candidate.idErreurExistante) {
      await db
        .update(errorEntry)
        .set({ occurrences: sql`${errorEntry.occurrences} + 1` })
        .where(eq(errorEntry.id, candidate.idErreurExistante));
    } else {
      await db.insert(errorEntry).values({
        subjectId: subj.id,
        ficheId: t.ficheId,
        tentativeId: t.id,
        type: candidate.type,
        description: candidate.description,
      });
    }
  }
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
