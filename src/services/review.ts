import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reviewCard } from "@/db/schema";
import { assertSectionOwnership } from "./guide";
import { createInitialState, rate as fsrsRate, previewIntervals, type CardState, type Note } from "@/core/fsrs/fsrsCore";

// S6 · ReviewService — l'échéancier (FUNCTIONS §3, §7). Possède exclusivement la
// table ReviewCard : createCard (unicité par section), rate (P9 ; la note
// utilisateur, jamais le verdict LLM — ADR 3), freeze/unfreeze (seul propriétaire
// du gel, DECISIONS.md cette session : colonne `gelee`, S5 filtrera dessus au
// Bloc 6.3). Ne touche jamais `section.statut` — cette transition (validee →
// en_revision) reste possédée par l'appelant (S4.validateSection), comme S3 gère
// déjà la sienne (rubrique_a_valider → prete).

export class ReviewCardAlreadyExistsError extends Error {
  constructor() {
    super("Une ReviewCard existe déjà pour cette section.");
  }
}

export class NoReviewCardError extends Error {
  constructor() {
    super("Aucune ReviewCard pour cette section.");
  }
}

export class ReviewCardFrozenError extends Error {
  constructor() {
    super("Cette ReviewCard est gelée, hors échéancier.");
  }
}

function toState(card: {
  due: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastReview: Date | null;
}): CardState {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    lastReview: card.lastReview ? card.lastReview.toISOString() : null,
  };
}

function toRow(state: CardState) {
  return {
    due: state.due,
    stability: state.stability,
    difficulty: state.difficulty,
    reps: state.reps,
    lapses: state.lapses,
    lastReview: state.lastReview ? new Date(state.lastReview) : null,
  };
}

export async function createCard(userId: string, sectionId: string) {
  await assertSectionOwnership(sectionId, userId);
  const existing = await db.query.reviewCard.findFirst({ where: eq(reviewCard.sectionId, sectionId) });
  if (existing) throw new ReviewCardAlreadyExistsError();

  const [card] = await db
    .insert(reviewCard)
    .values({ sectionId, ...toRow(createInitialState(new Date())) })
    .returning();
  return card;
}

export async function rate(userId: string, sectionId: string, note: Note) {
  await assertSectionOwnership(sectionId, userId);
  const card = await db.query.reviewCard.findFirst({ where: eq(reviewCard.sectionId, sectionId) });
  if (!card) throw new NoReviewCardError();
  if (card.gelee) throw new ReviewCardFrozenError();

  const nextState = fsrsRate(toState(card), note, new Date());
  const [updated] = await db
    .update(reviewCard)
    .set(toRow(nextState))
    .where(eq(reviewCard.id, card.id))
    .returning();
  return updated;
}

// createOrRate (fusion Machine B/C, 2026-07-15, DECISIONS.md) : seul point d'entrée
// désormais appelé par S4.validateSection — plus de rateRevision séparée, toute
// clôture de cycle (1ère validation ou Nᵉ répétition) passe ici. Compose
// createCard+rate tels quels (canaris review.canary.test.ts intacts) : une carte
// neuve ne doit jamais rester exposée sans note réelle appliquée par-dessus (son
// `due` par défaut, via createEmptyCard, serait "maintenant").
export async function createOrRate(userId: string, sectionId: string, note: Note) {
  try {
    await createCard(userId, sectionId);
  } catch (e) {
    if (!(e instanceof ReviewCardAlreadyExistsError)) throw e;
  }
  return rate(userId, sectionId, note);
}

// Idempotent : geler une carte déjà gelée (ou dégeler une carte déjà dégelée,
// ou une section sans ReviewCard) est un no-op silencieux — trois appelants
// (S1.archive, S2.setImportance(1), la cascade) n'ont pas à vérifier l'état
// avant d'appeler.
// Simulation sans effet de bord des 4 notes (U18 FsrsRatingBar, Bloc 6.4) — la
// même fonction pure P9 que `rate` utilise, juste sans écriture en base. Depuis
// la fusion Machine B/C (2026-07-15) : fonctionne aussi SANS ReviewCard
// existante (1ʳᵉ validation d'une section — le bilan Feynman y est désormais
// obligatoire) en simulant depuis un état neuf, comme `createOrRate` le ferait.
export async function preview(userId: string, sectionId: string): Promise<Record<Note, CardState>> {
  await assertSectionOwnership(sectionId, userId);
  const card = await db.query.reviewCard.findFirst({ where: eq(reviewCard.sectionId, sectionId) });
  const state = card ? toState(card) : createInitialState(new Date());
  return previewIntervals(state, new Date());
}

export async function freeze(userId: string, sectionId: string) {
  await assertSectionOwnership(sectionId, userId);
  await db.update(reviewCard).set({ gelee: true }).where(eq(reviewCard.sectionId, sectionId));
}

// `frozenSince` (Bloc 9.1 fix, USER_FLOW É6.4) : date à laquelle le gel a commencé
// (Chapter/Subject.archivedAt côté appelant) — décale `due` de la durée réelle
// écoulée, le reste de l'état FSRS (stability/difficulty/reps/lapses) est intact.
// Le gel « met l'horloge en pause » ; le dégel la reprend où elle s'était arrêtée,
// plutôt que de simuler une note qu'aucun humain n'a donnée (ADR 3).
export async function unfreeze(userId: string, sectionId: string, frozenSince: Date | null = null) {
  await assertSectionOwnership(sectionId, userId);
  const card = await db.query.reviewCard.findFirst({ where: eq(reviewCard.sectionId, sectionId) });
  if (!card) return undefined;

  const shiftDays = frozenSince ? daysBetween(frozenSince, new Date()) : 0;
  const due = new Date(card.due);
  due.setUTCDate(due.getUTCDate() + shiftDays);
  const [updated] = await db
    .update(reviewCard)
    .set({ gelee: false, due: due.toISOString().slice(0, 10) })
    .where(eq(reviewCard.id, card.id))
    .returning();
  return updated;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}
