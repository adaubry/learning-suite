import { and, eq, inArray, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { reviewCard, section, chapter, subject, correctionGuide, deferralLog, refileItem, queueOrder } from "@/db/schema";
import * as account from "./account";
import {
  buildDailyQueue,
  compareOrdreCurriculum,
  joursAvantExamen,
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
    .where(
      and(
        eq(subject.userId, userId),
        eq(subject.statut, "active"),
        eq(chapter.statut, "actif"),
        eq(reviewCard.gelee, false),
      ),
    );
  return rows;
}

async function loadDeferredToday(date: string) {
  return db.query.deferralLog.findMany({ where: eq(deferralLog.date, date) });
}

// Backlog COMPLET (jamais filtré par les reports d'aujourd'hui ici) : todayQueue
// a besoin de la liste entière pour distinguer un slot vraiment perdu (une
// candidate du backlog reportée) d'une carte re-file reportée (qui partage le
// même itemType "etude" dans DeferralLog mais n'est pas `prete`, donc absente
// d'ici de toute façon) — Bloc 9.1 fix, USER_FLOW É2.0.
async function loadReadyStudyCandidates(userId: string) {
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
    .where(
      and(
        eq(subject.userId, userId),
        eq(subject.statut, "active"),
        eq(chapter.statut, "actif"),
        eq(section.statut, "prete"),
      ),
    );

  // Ordre curriculum : aucun champ dédié en base (chapitres non ordonnés
  // explicitement) — tri stable (matière, création du chapitre, position dans
  // le chapitre), tiebreaker de dernier rang après importance/examen (P7).
  return rows
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
  const [config, { examDates }, deferredRows] = await Promise.all([
    account.getPlannerConfig(userId),
    loadExamDates(userId),
    loadDeferredToday(date),
  ]);
  const deferredKeys = new Set(deferredRows.map((r) => `${r.itemType}:${r.itemId}`));

  const reviewCards = (await loadActiveReviewCards(userId)).filter(
    (c) => !deferredKeys.has(`revision:${c.sectionId}`),
  );
  const allStudyCandidates = await loadReadyStudyCandidates(userId);
  const refileRows = await db.query.refileItem.findMany({ where: eq(refileItem.date, date) });

  // Slot perdu, jamais remplacé (USER_FLOW É2.0 : « sinon reporter ne coûte rien
  // et le vivier défile sans travail ») — deux sources, jamais confondues via le
  // seul itemType "etude" (Bloc 9.2 fix) : (a) une candidate encore dans le vivier
  // aujourd'hui et reportée normalement — une carte re-file "etude" reportée ne
  // compte pas, sa section n'est plus `prete` donc absente du vivier ; (b) une
  // dette d'avance (`avance: true`, S5.advanceFromBacklog) — comptée inconditionnellement,
  // même une fois la section étudiée et sortie du vivier.
  const deferredEtude = deferredRows.filter((r) => r.itemType === "etude");
  const deferredEtudeIds = new Set(deferredEtude.map((r) => r.itemId));
  const slotsLost = deferredEtude.filter(
    (r) => r.avance || allStudyCandidates.some((c) => c.sectionId === r.itemId),
  ).length;
  const newStudyCandidates = allStudyCandidates.filter((c) => !deferredEtudeIds.has(c.sectionId));
  const nouvellesParJour = Math.max(0, config.nouvellesParJour - slotsLost);

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

// État vide É2.0 (USER_FLOW) : « Rien à faire aujourd'hui » + prochaine échéance —
// la ReviewCard active la plus proche, gelées/chapitres-archivés déjà exclus par
// loadActiveReviewCards (mêmes filtres que todayQueue/horizon).
export async function nextDeadline(userId: string): Promise<string | null> {
  const cards = await loadActiveReviewCards(userId);
  if (cards.length === 0) return null;
  return cards.map((c) => c.due).sort()[0];
}

// CTA secondaire de l'état vide É2.0 (USER_FLOW) : la candidate que la file du
// jour montrerait en premier si le plafond n'était pas atteint — même tri que
// `nouvelle_etude` dans P7 (importance DESC, proximité d'examen, ordre
// curriculum), sur les candidates non encore reportées/avancées aujourd'hui.
export async function nextBacklogCandidate(
  userId: string,
  date: string = todayIso(),
): Promise<{ sectionId: string; titre: string } | null> {
  const [allStudyCandidates, deferredRows, { examDates }] = await Promise.all([
    loadReadyStudyCandidates(userId),
    loadDeferredToday(date),
    loadExamDates(userId),
  ]);
  const excluded = new Set(deferredRows.filter((r) => r.itemType === "etude").map((r) => r.itemId));
  const [top] = allStudyCandidates
    .filter((c) => !excluded.has(c.sectionId))
    .sort(
      (a, b) =>
        b.importance - a.importance ||
        (joursAvantExamen(date, examDates[a.subjectId]) ?? Infinity) -
          (joursAvantExamen(date, examDates[b.subjectId]) ?? Infinity) ||
        a.ordreCurriculum - b.ordreCurriculum,
    );
  if (!top) return null;
  const sec = await db.query.section.findFirst({ where: eq(section.id, top.sectionId), columns: { titre: true } });
  return sec ? { sectionId: top.sectionId, titre: sec.titre } : null;
}

// Avance une candidate du backlog à aujourd'hui en empruntant un slot de DEMAIN
// (USER_FLOW É2.0 : « ce qui consomme un slot de demain, pas d'aujourd'hui »).
// Ne démarre pas l'étude elle-même (S4.start, appelé séparément par l'appelant) —
// pose seulement la dette ; mono-utilisateur, même doctrine que `defer`/`refile`
// (pas de userId, pas de vérification de propriété, ADR 6).
export async function advanceFromBacklog(sectionId: string, date: string = todayIso()) {
  const tomorrow = new Date(`${date}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  await db.insert(deferralLog).values({
    date: tomorrow.toISOString().slice(0, 10),
    itemType: "etude",
    itemId: sectionId,
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
  type: "rubriques_a_valider" | "cours_modifie" | "chapitres_non_tries" | "archivage_suggere";
  count: number;
}

// FUNCTIONS §3 S5 : rubriques à valider, cours modifiés, chapitres non triés,
// suggestion d'archivage à examen+7j.
export async function attentionBadges(userId: string, date: string = todayIso()): Promise<AttentionBadge[]> {
  const badges: AttentionBadge[] = [];

  const rubriqueRows = await db
    .select({ id: section.id })
    .from(section)
    .innerJoin(chapter, eq(section.chapterId, chapter.id))
    .innerJoin(subject, eq(chapter.subjectId, subject.id))
    .where(and(eq(subject.userId, userId), eq(subject.statut, "active"), eq(section.statut, "rubrique_a_valider")));
  if (rubriqueRows.length > 0) badges.push({ type: "rubriques_a_valider", count: rubriqueRows.length });

  // « Cours modifié » (S1.commitUpdate, Bloc 8.2, ARCHITECTURE §7) : dérivé, pas de colonne
  // dédiée — une rubrique obsolète invalidée par la cascade reste ancrée à SON ancienne
  // chapterVersion pendant que la Section, elle, a été bumpée à la nouvelle. L'écart distingue
  // cette invalidation d'un S3.regenerate manuel (qui recrée aussitôt une rubrique non-obsolète,
  // même version) — tranché en récitation Bloc 8.2 (AskUserQuestion).
  const coursModifieRows = await db
    .select({ id: section.id })
    .from(section)
    .innerJoin(chapter, eq(section.chapterId, chapter.id))
    .innerJoin(subject, eq(chapter.subjectId, subject.id))
    .innerJoin(correctionGuide, eq(correctionGuide.sectionId, section.id))
    .where(
      and(
        eq(subject.userId, userId),
        eq(subject.statut, "active"),
        ne(section.statut, "archivee"),
        eq(correctionGuide.statut, "obsolete"),
        lt(correctionGuide.chapterVersion, section.chapterVersion),
      ),
    );
  if (coursModifieRows.length > 0) badges.push({ type: "cours_modifie", count: coursModifieRows.length });

  const activeChapters = await db
    .select({ id: chapter.id })
    .from(chapter)
    .innerJoin(subject, eq(chapter.subjectId, subject.id))
    .where(and(eq(subject.userId, userId), eq(subject.statut, "active"), eq(chapter.statut, "actif")));

  // « Jamais trié » = aucune section (sectionnement jamais lancé) OU au moins une section encore
  // a_trier. La 2ᵉ moitié seule ne suffit plus depuis le ré-import (Bloc 8.4) : un chapitre peut
  // être dans un état mixte (sections déjà triées de longue date + nouvelles a_trier tout juste
  // apparues par S1.commitUpdate) — l'ancienne requête « zéro section non-a_trier », correcte
  // tant qu'un chapitre n'était triable qu'en un seul bloc à l'import, aurait laissé ce cas
  // invisible (DECISIONS.md bloc 8.4).
  const sectionsDesChapitres = activeChapters.length
    ? await db
        .select({ chapterId: section.chapterId, statut: section.statut })
        .from(section)
        .where(inArray(section.chapterId, activeChapters.map((c) => c.id)))
    : [];
  const parChapitre = new Map<string, string[]>();
  for (const s of sectionsDesChapitres) {
    parChapitre.set(s.chapterId, [...(parChapitre.get(s.chapterId) ?? []), s.statut]);
  }
  const chapitresNonTries = activeChapters.filter((c) => {
    const statuts = parChapitre.get(c.id) ?? [];
    return statuts.length === 0 || statuts.includes("a_trier");
  }).length;
  if (chapitresNonTries > 0) badges.push({ type: "chapitres_non_tries", count: chapitresNonTries });

  const { subjects } = await loadExamDates(userId);
  const seuilArchivage = new Date(date);
  seuilArchivage.setUTCDate(seuilArchivage.getUTCDate() - 7);
  const seuilIso = seuilArchivage.toISOString().slice(0, 10);
  const archivageSuggere = subjects.filter((s) => s.dateExamen && s.dateExamen < seuilIso).length;
  if (archivageSuggere > 0) badges.push({ type: "archivage_suggere", count: archivageSuggere });

  return badges;
}
