import type { ControlPoint } from "@/llm/schemas/guide";
import type { FeynmanTour } from "@/llm/context/feynmanTurn";

// L5 · ContextBuilder Feynman — bilan (ARCHITECTURE §9 ligne 5, bilan) — fonction
// pure : rubrique + historique COMPLET du dialogue. Pas le contenu de section
// (le bilan évalue ce qui a été dit dans l'échange, pas une nouvelle correction
// contre le cours).

export interface FeynmanBilanContextInput {
  points: ControlPoint[];
  historique: FeynmanTour[];
}

export interface FeynmanBilanContext {
  points: { intitule: string; attendu: string }[];
  historique: FeynmanTour[];
}

export function buildFeynmanBilanContext(input: FeynmanBilanContextInput): FeynmanBilanContext {
  return {
    points: input.points.map((p) => ({ intitule: p.intitule, attendu: p.attendu })),
    historique: input.historique.map((h) => ({ role: h.role, texte: h.texte })),
  };
}
