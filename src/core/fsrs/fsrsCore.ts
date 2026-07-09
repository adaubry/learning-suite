import { fsrs, generatorParameters, createEmptyCard, Rating, type CardInput, type Card } from "ts-fsrs";

// P9 · fsrsCore (FUNCTIONS §1, ARCHITECTURE §8/§11 ADR3) — pur, sans I/O.
// Wrapper mince autour de ts-fsrs (TECH_MAPPING). `enable_short_term: false` :
// aucune étape d'apprentissage à court terme (Learning/Relearning) — le domaine
// (révision espacée de sections de cours, pas de flashcards) n'en a pas l'usage,
// et ça élimine `state`/`learning_steps` du besoin de persistance : avec ce
// réglage confirmé par l'algorithme, un CardState est toujours soit New
// (reps = 0) soit Review (reps > 0), jamais Learning/Relearning — exactement
// les colonnes déjà présentes sur ReviewCard (ARCHITECTURE §8), aucun ajout de
// schéma nécessaire pour P9.

export type Note = "again" | "hard" | "good" | "easy";

export interface CardState {
  due: string; // ISO date (YYYY-MM-DD)
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastReview: string | null; // ISO datetime
}

const scheduler = fsrs(generatorParameters({ enable_short_term: false }));

const NOTE_TO_GRADE: Record<Note, 1 | 2 | 3 | 4> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

function toCardInput(state: CardState): CardInput {
  return {
    due: state.due,
    stability: state.stability,
    difficulty: state.difficulty,
    reps: state.reps,
    lapses: state.lapses,
    state: state.reps === 0 ? "New" : "Review",
    last_review: state.lastReview,
    scheduled_days: 0,
    learning_steps: 0,
    elapsed_days: 0,
  };
}

function fromCard(card: Card): CardState {
  return {
    due: card.due.toISOString().slice(0, 10),
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    lastReview: card.last_review ? card.last_review.toISOString() : null,
  };
}

export function createInitialState(now: Date): CardState {
  return fromCard(createEmptyCard(now));
}

// Note utilisateur → nouvel état (jamais le verdict LLM — ADR 3).
export function rate(state: CardState, note: Note, now: Date): CardState {
  const { card } = scheduler.next(toCardInput(state), now, NOTE_TO_GRADE[note]);
  return fromCard(card);
}

// Simulation des 4 notes sans effet de bord (U18 FsrsRatingBar, Bloc 6.3).
export function previewIntervals(state: CardState, now: Date): Record<Note, CardState> {
  const record = scheduler.repeat(toCardInput(state), now);
  return {
    again: fromCard(record[Rating.Again].card),
    hard: fromCard(record[Rating.Hard].card),
    good: fromCard(record[Rating.Good].card),
    easy: fromCard(record[Rating.Easy].card),
  };
}
