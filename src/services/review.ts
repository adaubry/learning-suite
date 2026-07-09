import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reviewCard } from "@/db/schema";
import { assertSectionOwnership } from "./guide";
import { createInitialState, rate as fsrsRate, type CardState, type Note } from "@/core/fsrs/fsrsCore";

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

// Idempotent : geler une carte déjà gelée (ou dégeler une carte déjà dégelée,
// ou une section sans ReviewCard) est un no-op silencieux — trois appelants
// (S1.archive, S2.setImportance(1), la cascade) n'ont pas à vérifier l'état
// avant d'appeler.
export async function freeze(userId: string, sectionId: string) {
  await assertSectionOwnership(sectionId, userId);
  await db.update(reviewCard).set({ gelee: true }).where(eq(reviewCard.sectionId, sectionId));
}

export async function unfreeze(userId: string, sectionId: string) {
  await assertSectionOwnership(sectionId, userId);
  await db.update(reviewCard).set({ gelee: false }).where(eq(reviewCard.sectionId, sectionId));
}
