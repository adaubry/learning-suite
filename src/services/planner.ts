import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { reviewCard, fiche, ficheSet, subject, deferralLog, refileItem, queueOrder, studyCycle } from "@/db/schema";
import * as account from "./account";
import {
  buildDailyQueue,
  compareOrdreCurriculum,
  joursAvantExamen,
  type QueueItem,
  type ReviewCardInput,
} from "@/core/planner/buildDailyQueue";
import { computeHorizon, type HorizonReviewCard } from "@/core/planner/computeHorizon";

// PlannerService — l'organe central (ARCHITECTURE.md v2 §3). Aucun appel LLM.
// `todayQueue`/`horizon` délèguent le calcul à P7/P8 (purs) ; ce module charge
// l'état courant et applique l'ordre manuel par-dessus. `refile`/`defer`/`reorder`
// écrivent des tables mono-utilisateur (pas de user_id).

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

// Cartes non gelées des fiches actives (set actif, matière active).
async function loadActiveReviewCards(userId: string): Promise<ReviewCardInput[]> {
  return db
    .select({ ficheId: reviewCard.ficheId, due: reviewCard.due, subjectId: subject.id })
    .from(reviewCard)
    .innerJoin(fiche, eq(reviewCard.ficheId, fiche.id))
    .innerJoin(ficheSet, eq(fiche.setId, ficheSet.id))
    .innerJoin(subject, eq(ficheSet.subjectId, subject.id))
    .where(
      and(
        eq(subject.userId, userId),
        eq(subject.statut, "active"),
        eq(ficheSet.statut, "actif"),
        eq(fiche.statut, "en_revision"),
        eq(reviewCard.gelee, false),
      ),
    );
}

// Nouvelles fiches déjà étudiées (cycle `etude` noté) ce jour-là : elles ont quitté
// le vivier, mais leur slot du jour est consommé — sans ce décompte, chaque fiche
// terminée en ferait entrer une autre et le plafond ne tiendrait jamais.
async function countNewFichesStudied(userId: string, date: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${studyCycle.ficheId})::int` })
    .from(studyCycle)
    .where(
      and(
        eq(studyCycle.userId, userId),
        eq(studyCycle.type, "etude"),
        isNotNull(studyCycle.note),
        sql`(${studyCycle.closedAt} at time zone 'UTC')::date = ${date}`,
      ),
    );
  return row?.n ?? 0;
}

async function loadDeferredToday(date: string) {
  return db.query.deferralLog.findMany({ where: eq(deferralLog.date, date) });
}

// Vivier COMPLET des nouvelles fiches (jamais filtré par les reports du jour ici) :
// todayQueue a besoin de la liste entière pour compter les slots perdus.
async function loadNewFicheCandidates(userId: string) {
  const rows = await db
    .select({
      ficheId: fiche.id,
      subjectId: subject.id,
      subjectOrdre: subject.ordre,
      setCreatedAt: ficheSet.createdAt,
      numero: fiche.numero,
    })
    .from(fiche)
    .innerJoin(ficheSet, eq(fiche.setId, ficheSet.id))
    .innerJoin(subject, eq(ficheSet.subjectId, subject.id))
    .where(
      and(
        eq(subject.userId, userId),
        eq(subject.statut, "active"),
        eq(ficheSet.statut, "actif"),
        eq(fiche.statut, "nouvelle"),
      ),
    );

  return rows
    .sort(compareOrdreCurriculum)
    .map((r, i) => ({ ficheId: r.ficheId, subjectId: r.subjectId, ordreCurriculum: i }));
}

// Exportée : l'UI sérialise l'ordre courant dans les formulaires de
// réordonnancement (boutons monter/descendre).
export function queueItemKey(item: QueueItem): string {
  return item.kind === "re_file" ? `re_file:${item.itemType}:${item.itemId}` : `${item.kind}:${item.ficheId}`;
}

// Réconciliation de l'ordre manuel : les items encore présents
// gardent la position stockée ; tout item nouveau depuis le dernier reorder
// (ex. re-file arrivé en cours de journée) s'ajoute à la fin, dans son ordre
// naturel — cohérent avec la règle « re-file en fin de file ».
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
  const [config, { examDates }, deferredRows, etudieesAujourdhui] = await Promise.all([
    account.getPlannerConfig(userId),
    loadExamDates(userId),
    loadDeferredToday(date),
    countNewFichesStudied(userId, date),
  ]);
  const deferredKeys = new Set(deferredRows.map((r) => `${r.itemType}:${r.itemId}`));

  const reviewCards = (await loadActiveReviewCards(userId)).filter(
    (c) => !deferredKeys.has(`revision:${c.ficheId}`),
  );
  const allStudyCandidates = await loadNewFicheCandidates(userId);
  const refileRows = await db.query.refileItem.findMany({ where: eq(refileItem.date, date) });

  // Slot perdu, jamais remplacé (sinon reporter ne coûte rien et le vivier défile
  // sans travail) — deux sources : (a) une candidate encore dans le vivier
  // aujourd'hui et reportée ; (b) une dette d'avance (`avance: true`,
  // advanceFromBacklog), comptée même une fois la fiche étudiée.
  const deferredEtude = deferredRows.filter((r) => r.itemType === "etude");
  const deferredEtudeIds = new Set(deferredEtude.map((r) => r.itemId));
  const slotsLost = deferredEtude.filter(
    (r) => r.avance || allStudyCandidates.some((c) => c.ficheId === r.itemId),
  ).length;
  const newStudyCandidates = allStudyCandidates.filter((c) => !deferredEtudeIds.has(c.ficheId));
  const nouvellesParJour =
    config.nouvellesParJour === null ? null : Math.max(0, config.nouvellesParJour - slotsLost - etudieesAujourdhui);

  const raw = buildDailyQueue({
    today: date,
    reviewCards,
    newStudyCandidates,
    refileToday: refileRows.map((r) => ({ itemType: r.itemType, itemId: r.itemId })),
    examDates,
    nouvellesParJour,
  });

  return applyManualOrder(raw, await loadStoredOrder(date));
}

// État vide de l'accueil : prochaine échéance de révision.
export async function nextDeadline(userId: string): Promise<string | null> {
  const cards = await loadActiveReviewCards(userId);
  if (cards.length === 0) return null;
  return cards.map((c) => c.due).sort()[0];
}

// [Avancer une fiche de demain] : la candidate que la file montrerait en premier
// si le plafond n'était pas atteint (même tri que P7), hors reports du jour.
export async function nextBacklogCandidate(
  userId: string,
  date: string = todayIso(),
): Promise<{ ficheId: string; titre: string } | null> {
  const [allStudyCandidates, deferredRows, { examDates }] = await Promise.all([
    loadNewFicheCandidates(userId),
    loadDeferredToday(date),
    loadExamDates(userId),
  ]);
  const excluded = new Set(deferredRows.filter((r) => r.itemType === "etude").map((r) => r.itemId));
  const [top] = allStudyCandidates
    .filter((c) => !excluded.has(c.ficheId))
    .sort(
      (a, b) =>
        (joursAvantExamen(date, examDates[a.subjectId]) ?? Infinity) -
          (joursAvantExamen(date, examDates[b.subjectId]) ?? Infinity) || a.ordreCurriculum - b.ordreCurriculum,
    );
  if (!top) return null;
  const f = await db.query.fiche.findFirst({ where: eq(fiche.id, top.ficheId), columns: { titre: true } });
  return f ? { ficheId: top.ficheId, titre: f.titre } : null;
}

// Avance une nouvelle fiche à aujourd'hui en empruntant un slot de DEMAIN. Ne
// démarre pas la session (l'appelant redirige vers /etude).
export async function advanceFromBacklog(ficheId: string, date: string = todayIso()) {
  const tomorrow = new Date(`${date}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  await db.insert(deferralLog).values({
    date: tomorrow.toISOString().slice(0, 10),
    itemType: "etude",
    itemId: ficheId,
    avance: true,
  });
}

export async function horizon(userId: string, date: string = todayIso()) {
  const [reviewCards, { examDates }] = await Promise.all([
    loadActiveReviewCards(userId) as Promise<HorizonReviewCard[]>,
    loadExamDates(userId),
  ]);
  return computeHorizon({ today: date, reviewCards, examDates });
}

// Note Again → la fiche revient en fin de file du jour même. Expiration : filtrage
// par date à chaque todayQueue ; la purge de stockage est `purgeExpired`.
export async function refile(itemType: ItemType, itemId: string, date: string = todayIso()) {
  await db.insert(refileItem).values({ date, itemType, itemId });
}

// Reporter : révision reportée ⇒ reste due, dette visible demain ; nouvelle fiche
// reportée ⇒ slot du jour perdu, sans remplacement. Les deux retirent l'item de
// la file d'aujourd'hui seulement.
export async function defer(itemType: ItemType, itemId: string, date: string = todayIso()) {
  await db.insert(deferralLog).values({ date, itemType, itemId });
}

// Permutation datée : remplace l'ordre entier du jour (l'UI envoie la liste
// complète des clés).
export async function reorder(orderedKeys: string[], date: string = todayIso()) {
  await db
    .insert(queueOrder)
    .values({ date, order: orderedKeys })
    .onConflictDoUpdate({ target: queueOrder.date, set: { order: orderedKeys } });
}

// Housekeeping (cron quotidien) : `todayQueue` ne lit jamais une ligne antérieure à
// aujourd'hui ; ceci empêche seulement refile_item/queue_order de croître sans fin.
export async function purgeExpired(date: string = todayIso()) {
  await db.delete(refileItem).where(lt(refileItem.date, date));
  await db.delete(queueOrder).where(lt(queueOrder.date, date));
}
