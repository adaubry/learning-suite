import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { reviewCard } from "@/db/schema";
import { loadOwnedFiche } from "./ownership";
import { createInitialState, rate as fsrsRate, previewIntervals, type CardState, type Note } from "@/core/fsrs/fsrsCore";

// ReviewService — l'échéancier (ARCHITECTURE.md v2 §8). Seul propriétaire de la
// table review_card : création (une carte par fiche), note (P9 ; la note
// utilisateur, jamais le verdict LLM), gel/dégel. Ne touche jamais `fiche.statut`,
// possédé par l'appelant.

export class ReviewCardAlreadyExistsError extends Error {
  constructor() {
    super("Une carte de révision existe déjà pour cette fiche.");
  }
}

export class NoReviewCardError extends Error {
  constructor() {
    super("Aucune carte de révision pour cette fiche.");
  }
}

export class ReviewCardFrozenError extends Error {
  constructor() {
    super("Cette carte est gelée, hors échéancier.");
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

export async function createCard(userId: string, ficheId: string) {
  await loadOwnedFiche(ficheId, userId);
  const existing = await db.query.reviewCard.findFirst({ where: eq(reviewCard.ficheId, ficheId) });
  if (existing) throw new ReviewCardAlreadyExistsError();

  const [card] = await db
    .insert(reviewCard)
    .values({ ficheId, ...toRow(createInitialState(new Date())) })
    .returning();
  return card;
}

export async function rate(userId: string, ficheId: string, note: Note) {
  await loadOwnedFiche(ficheId, userId);
  const card = await db.query.reviewCard.findFirst({ where: eq(reviewCard.ficheId, ficheId) });
  if (!card) throw new NoReviewCardError();
  if (card.gelee) throw new ReviewCardFrozenError();

  const nextState = fsrsRate(toState(card), note, new Date());
  const [updated] = await db.update(reviewCard).set(toRow(nextState)).where(eq(reviewCard.id, card.id)).returning();
  return updated;
}

// Point d'entrée de la clôture d'un cycle : crée la carte à la 1ʳᵉ note, puis
// note. Une carte neuve n'est jamais laissée sans note (son `due` serait « maintenant »).
export async function createOrRate(userId: string, ficheId: string, note: Note) {
  try {
    await createCard(userId, ficheId);
  } catch (e) {
    if (!(e instanceof ReviewCardAlreadyExistsError)) throw e;
  }
  return rate(userId, ficheId, note);
}

// Simulation des 4 notes sans effet de bord (boutons de notation) — depuis un
// état neuf si la fiche n'a pas encore de carte.
export async function preview(userId: string, ficheId: string): Promise<Record<Note, CardState>> {
  await loadOwnedFiche(ficheId, userId);
  const card = await db.query.reviewCard.findFirst({ where: eq(reviewCard.ficheId, ficheId) });
  const state = card ? toState(card) : createInitialState(new Date());
  return previewIntervals(state, new Date());
}

// Gel/dégel idempotents, en lot : appelés par l'archivage (set, matière) et le
// ré-import (fiche retirée / réapparue). Les appelants ont déjà vérifié la propriété.
export async function freeze(ficheIds: string[]) {
  if (ficheIds.length === 0) return;
  await db.update(reviewCard).set({ gelee: true }).where(inArray(reviewCard.ficheId, ficheIds));
}

// `frozenSince` : début du gel — décale `due` de la durée réelle écoulée ; le reste
// de l'état FSRS est intact (le gel met l'horloge en pause, il ne simule aucune note).
export async function unfreeze(ficheIds: string[], frozenSince: Date | null = null) {
  if (ficheIds.length === 0) return;
  const cards = await db.query.reviewCard.findMany({ where: inArray(reviewCard.ficheId, ficheIds) });
  const shiftDays = frozenSince ? Math.round((Date.now() - frozenSince.getTime()) / 86_400_000) : 0;
  for (const card of cards) {
    if (!card.gelee) continue;
    const due = new Date(`${card.due}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + shiftDays);
    await db
      .update(reviewCard)
      .set({ gelee: false, due: due.toISOString().slice(0, 10) })
      .where(eq(reviewCard.id, card.id));
  }
}
