import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { errorEntry, studySession, chapter, subject } from "@/db/schema";
import { assertSectionOwnership } from "./guide";
import type { MergedErrorCandidate, ErreurType } from "@/core/correction/verdict";

// S7 · ErrorService (FUNCTIONS §3, §7) : le carnet. `activeFor`/`activeForSection`
// (Bloc 5.1) servent les ContextBuilders L2/L3. Bloc 5.3 ajoute commitCandidates
// (Règle de commit USER_FLOW É3.2) et le CRUD du carnet (list/resolve/edit/delete,
// É5.1).

const MAX_ERREURS_ACTIVES_CONTEXTE = 20; // ponytail: plafond arbitraire, à ajuster si le contexte LLM déborde

async function assertErrorOwnership(errorId: string, userId: string) {
  const err = await db.query.errorEntry.findFirst({ where: eq(errorEntry.id, errorId) });
  if (!err) throw new Error("Erreur introuvable.");
  const subj = await db.query.subject.findFirst({ where: eq(subject.id, err.subjectId) });
  if (!subj || subj.userId !== userId) throw new Error("Erreur introuvable.");
  return err;
}

// L2 (rubrique) : erreurs actives de la MATIÈRE entière (orientent les pièges).
export async function activeFor(subjectId: string) {
  return db.query.errorEntry.findMany({
    where: and(eq(errorEntry.subjectId, subjectId), eq(errorEntry.statut, "active")),
    limit: MAX_ERREURS_ACTIVES_CONTEXTE,
  });
}

// L3 (correction) : erreurs actives de la SECTION uniquement (ARCHITECTURE §9
// ligne 3+4 — détection de récidive, périmètre plus étroit que L2).
export async function activeForSection(sectionId: string) {
  return db.query.errorEntry.findMany({
    where: and(eq(errorEntry.sectionId, sectionId), eq(errorEntry.statut, "active")),
    limit: MAX_ERREURS_ACTIVES_CONTEXTE,
  });
}

// USER_FLOW É3.2 « Règle de commit » : les candidates NON rejetées (index absent
// de `rejectedIndexes`) sont acceptées telles quelles — que l'utilisateur ait
// cliqué [Tout accepter] ou simplement quitté l'écran sans statuer, le résultat
// est identique. Pas d'édition de texte ici (DECISIONS.md bloc 5.3, révisé
// ponytail-review) : corriger une description reste le rôle de S7.edit, depuis
// le carnet, qu'il s'agisse d'une récidive ou d'une candidate fraîchement
// committée. Récidive (`idErreurExistante` non-nul, résolu par S4 dès la
// correction, DECISIONS.md bloc 5.1) : incrémente `occurrences` au lieu de créer
// un doublon. Idempotence : confiée aux appelants (S4 resolveOutcome/
// validateSection ne rejouent jamais cette fonction sur un cycle déjà
// refermé).
export async function commitCandidates(userId: string, sessionId: string, rejectedIndexes: number[] = []) {
  const sess = await db.query.studySession.findFirst({ where: eq(studySession.id, sessionId) });
  if (!sess) throw new Error("Session introuvable.");
  const sec = await assertSectionOwnership(sess.sectionId, userId);

  const correction = sess.correction as { erreursCandidates: MergedErrorCandidate[] } | null;
  const candidates = correction?.erreursCandidates ?? [];
  if (candidates.length === 0) return;

  const chap = await db.query.chapter.findFirst({ where: eq(chapter.id, sec.chapterId) });
  if (!chap) throw new Error("Section introuvable.");

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
        subjectId: chap.subjectId,
        sectionId: sess.sectionId,
        sessionId: sess.id,
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
  sectionId?: string;
}

// É5.1 : filtres matière/statut/type/section — toujours scopé aux matières de
// l'utilisateur (ErrorEntry ne porte pas directement le userId, résolu via
// `subject.user_id`, même précédent que account.listSubjects).
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
  if (filters.sectionId) conditions.push(eq(errorEntry.sectionId, filters.sectionId));

  return db.query.errorEntry.findMany({
    where: and(...conditions),
    orderBy: (e, { desc }) => [desc(e.createdAt)],
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

export async function edit(
  userId: string,
  errorId: string,
  input: { type?: ErreurType; description?: string },
) {
  await assertErrorOwnership(errorId, userId);
  const [updated] = await db.update(errorEntry).set(input).where(eq(errorEntry.id, errorId)).returning();
  return updated;
}

// Confirmation légère côté UI (U8 ConfirmDialog) — « erreur créée à tort »,
// suppression réelle (pas d'archivage, contrairement aux matières/chapitres :
// une ErrorEntry n'a pas de dépendants).
export async function deleteEntry(userId: string, errorId: string) {
  await assertErrorOwnership(errorId, userId);
  await db.delete(errorEntry).where(eq(errorEntry.id, errorId));
  return { ok: true as const };
}
