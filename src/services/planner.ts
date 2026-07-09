import { and, eq, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { reviewCard, section, chapter, subject, deferralLog, refileItem, queueOrder } from "@/db/schema";
import * as account from "./account";
import {
  buildDailyQueue,
  compareOrdreCurriculum,
  type QueueItem,
  type ReviewCardInput,
} from "@/core/planner/buildDailyQueue";
import { computeHorizon, type HorizonReviewCard } from "@/core/planner/computeHorizon";

// S5 · PlannerService — l'organe central (FUNCTIONS §3, §7 ; ARCHITECTURE §3).
// Aucun appel LLM ici. `todayQueue`/`horizon` délèguent tout le calcul à
// P7/P8 (purs) ; ce module ne fait que charger l'état courant et appliquer
// l'ordre manuel (S5.reorder) par-dessus le résultat de P7. `refile`/`defer`
// écrivent RefileItem/DeferralLog — mono-utilisateur (ADR 6), pas de user_id
// sur ces tables (même doctrine que leur schéma existant), donc pas de
// paramètre userId sur ces trois entrées ni sur `reorder`.

export type ItemType = "etude" | "revision";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function loadExamDates(userId: string) {
  const subjects = await db.query.subject.findMany({
    where: and(eq(subject.userId, userId), eq(subject.statut, "active")),
  });
  return {
    subjects,
    examDates: Object.fromEntries(subjects.map((s) => [s.id, s.dateExamen])) as Record<string, string | null>,
  };
}

async function loadActiveReviewCards(userId: string): Promise<ReviewCardInput[]> {
  const rows = await db
    .select({
      sectionId: reviewCard.sectionId,
      due: reviewCard.due,
      importance: section.importance,
      subjectId: chapter.subjectId,
    })
    .from(reviewCard)
    .innerJoin(section, eq(reviewCard.sectionId, section.id))
    .innerJoin(chapter, eq(section.chapterId, chapter.id))
    .innerJoin(subject, eq(chapter.subjectId, subject.id))
    .where(and(eq(subject.userId, userId), eq(subject.statut, "active"), eq(reviewCard.gelee, false)));
  return rows;
}

async function loadDeferredToday(date: string) {
  const rows = await db.query.deferralLog.findMany({ where: eq(deferralLog.date, date) });
  return new Set(rows.map((r) => `${r.itemType}:${r.itemId}`));
}

async function loadReadyStudyCandidates(userId: string, deferredKeys: Set<string>) {
  const rows = await db
    .select({
      sectionId: section.id,
      importance: section.importance,
      subjectId: chapter.subjectId,
      subjectOrdre: subject.ordre,
      chapterMaj: chapter.maj,
      sectionOrdre: section.ordre,
    })
    .from(section)
    .innerJoin(chapter, eq(section.chapterId, chapter.id))
    .innerJoin(subject, eq(chapter.subjectId, subject.id))
    .where(and(eq(subject.userId, userId), eq(subject.statut, "active"), eq(section.statut, "prete")));

  // Ordre curriculum : aucun champ dédié en base (chapitres non ordonnés
  // explicitement) — tri stable (matière, création du chapitre, position dans
  // le chapitre), tiebreaker de dernier rang après importance/examen (P7).
  return rows
    .filter((r) => !deferredKeys.has(`etude:${r.sectionId}`))
    .sort(compareOrdreCurriculum)
    .map((r, i) => ({ sectionId: r.sectionId, importance: r.importance, subjectId: r.subjectId, ordreCurriculum: i }));
}

// Exportée : l'UI (U10) en a besoin pour sérialiser l'ordre courant dans les
// formulaires de réordonnancement (boutons monter/descendre).
export function queueItemKey(item: QueueItem): string {
  return item.kind === "re_file" ? `re_file:${item.itemType}:${item.itemId}` : `${item.kind}:${item.sectionId}`;
}

// Réconciliation de l'ordre manuel (S5.reorder) : les items encore présents
// gardent la position stockée ; tout item nouveau depuis le dernier reorder
// (ex. re-file arrivé en cours de journée) s'ajoute à la fin, dans son ordre
// naturel — cohérent avec la règle « re-file en fin de file » (ARCHITECTURE §3).
function applyManualOrder(fresh: QueueItem[], storedKeys: string[] | null): QueueItem[] {
  if (!storedKeys || storedKeys.length === 0) return fresh;
  const remaining = new Map(fresh.map((item) => [queueItemKey(item), item]));
  const ordered: QueueItem[] = [];
  for (const key of storedKeys) {
    const item = remaining.get(key);
    if (item) {
      ordered.push(item);
      remaining.delete(key);
    }
  }
  for (const item of fresh) {
    if (remaining.has(queueItemKey(item))) ordered.push(item);
  }
  return ordered;
}

async function loadStoredOrder(date: string): Promise<string[] | null> {
  const row = await db.query.queueOrder.findFirst({ where: eq(queueOrder.date, date) });
  return (row?.order as string[] | undefined) ?? null;
}

export async function todayQueue(userId: string, date: string = todayIso()): Promise<QueueItem[]> {
  const [config, { examDates }, deferredKeys] = await Promise.all([
    account.getPlannerConfig(userId),
    loadExamDates(userId),
    loadDeferredToday(date),
  ]);

  const reviewCards = (await loadActiveReviewCards(userId)).filter(
    (c) => !deferredKeys.has(`revision:${c.sectionId}`),
  );
  const newStudyCandidates = await loadReadyStudyCandidates(userId, deferredKeys);
  const refileRows = await db.query.refileItem.findMany({ where: eq(refileItem.date, date) });

  const raw = buildDailyQueue({
    today: date,
    reviewCards,
    newStudyCandidates,
    refileToday: refileRows.map((r) => ({ itemType: r.itemType, itemId: r.itemId })),
    examDates,
    nouvellesParJour: config.nouvellesParJour,
  });

  return applyManualOrder(raw, await loadStoredOrder(date));
}

export async function horizon(userId: string, date: string = todayIso()) {
  const [reviewCards, { examDates }] = await Promise.all([
    loadActiveReviewCards(userId) as Promise<HorizonReviewCard[]>,
    loadExamDates(userId),
  ]);
  return computeHorizon({ today: date, reviewCards, examDates });
}

// Élément regénéré → queue du jour même (ARCHITECTURE §3 : note Again, retry de
// blurting différé). Expiration : filtrage par date à chaque todayQueue (une
// ligne d'hier n'est plus jamais lue) ; la purge active de stockage (housekeeping,
// pas de correction fonctionnelle) est `purgeExpired`, Bloc 6.4.
export async function refile(itemType: ItemType, itemId: string, date: string = todayIso()) {
  await db.insert(refileItem).values({ date, itemType, itemId });
}

// Reporter (journalisé) : révision reportée ⇒ reste due, dette visible demain ;
// étude reportée ⇒ slot du jour perdu, sans remplacement (ARCHITECTURE §3). Les
// deux cas retirent simplement l'item de la file d'AUJOURD'HUI (loadDeferredToday) ;
// une révision reportée redevient naturellement due (voire plus en retard) le
// lendemain sans action supplémentaire.
export async function defer(itemType: ItemType, itemId: string, date: string = todayIso()) {
  await db.insert(deferralLog).values({ date, itemType, itemId });
}

// Permutation datée (FUNCTIONS §7 « purge de l'ordre manuel » → minuit) :
// remplace l'ordre entier pour ce jour (le réordonnancement shadcn v1 envoie
// la liste complète des clés, pas un déplacement incrémental).
export async function reorder(orderedKeys: string[], date: string = todayIso()) {
  await db
    .insert(queueOrder)
    .values({ date, order: orderedKeys })
    .onConflictDoUpdate({ target: queueOrder.date, set: { order: orderedKeys } });
}

// Purge de l'ordre manuel + expiration de la re-file (FUNCTIONS §5 : tâche de
// fond, déclencheur minuit ; PLAN Bloc 6.4). Housekeeping seul : `todayQueue`
// filtre déjà par date et ne lit jamais une ligne antérieure à aujourd'hui —
// cette fonction ne fait que ne pas laisser ces deux tables mono-utilisateur
// croître indéfiniment (RefileItem/QueueOrder, ARCHITECTURE §8).
export async function purgeExpired(date: string = todayIso()) {
  await db.delete(refileItem).where(lt(refileItem.date, date));
  await db.delete(queueOrder).where(lt(queueOrder.date, date));
}

export interface AttentionBadge {
  type: "rubriques_a_valider" | "chapitres_non_tries" | "archivage_suggere";
  count: number;
}

// FUNCTIONS §3 S5 : rubriques à valider, cours modifiés, chapitres non triés,
// suggestion d'archivage à examen+7j. « Cours modifiés » dépend du versionnage
// (Phase 8, inexistant) — absent ce bloc-ci, pas simulé (DECISIONS.md bloc 6.3).
export async function attentionBadges(userId: string, date: string = todayIso()): Promise<AttentionBadge[]> {
  const badges: AttentionBadge[] = [];

  const rubriqueRows = await db
    .select({ id: section.id })
    .from(section)
    .innerJoin(chapter, eq(section.chapterId, chapter.id))
    .innerJoin(subject, eq(chapter.subjectId, subject.id))
    .where(and(eq(subject.userId, userId), eq(subject.statut, "active"), eq(section.statut, "rubrique_a_valider")));
  if (rubriqueRows.length > 0) badges.push({ type: "rubriques_a_valider", count: rubriqueRows.length });

  const activeChapters = await db
    .select({ id: chapter.id })
    .from(chapter)
    .innerJoin(subject, eq(chapter.subjectId, subject.id))
    .where(and(eq(subject.userId, userId), eq(subject.statut, "active"), eq(chapter.statut, "actif")));
  const triagedChapterIds = await db
    .selectDistinct({ chapterId: section.chapterId })
    .from(section)
    .where(ne(section.statut, "a_trier"));
  const triagedSet = new Set(triagedChapterIds.map((r) => r.chapterId));
  const chapitresNonTries = activeChapters.filter((c) => !triagedSet.has(c.id)).length;
  if (chapitresNonTries > 0) badges.push({ type: "chapitres_non_tries", count: chapitresNonTries });

  const { subjects } = await loadExamDates(userId);
  const seuilArchivage = new Date(date);
  seuilArchivage.setUTCDate(seuilArchivage.getUTCDate() - 7);
  const seuilIso = seuilArchivage.toISOString().slice(0, 10);
  const archivageSuggere = subjects.filter((s) => s.dateExamen && s.dateExamen < seuilIso).length;
  if (archivageSuggere > 0) badges.push({ type: "archivage_suggere", count: archivageSuggere });

  return badges;
}
