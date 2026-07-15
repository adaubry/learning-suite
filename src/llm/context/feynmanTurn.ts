import type { ControlPoint } from "@/llm/schemas/guide";

// L4 · ContextBuilder Feynman — tour (ARCHITECTURE §9 ligne 5, par tour) —
// fonction pure : rubrique + contenu de section (nécessaire ici, contrairement à
// L3 : le questionneur doit pouvoir vérifier des détails au-delà de la rubrique)
// + historique CETTE session + erreurs actives (section ET matière, déjà fusionnées
// par l'appelant) + dernier transcript + brouillon (REVAMP v2, 2026-07-15 : dernier
// texte de blurting soumis pour ce cycle — les relances se construisent comme un
// développement progressif de CE brouillon, pas une exploration libre de la rubrique).

export interface FeynmanTour {
  role: "etudiant" | "ia";
  texte: string;
}

export interface FeynmanTurnContextInput {
  points: ControlPoint[];
  contenuSection: string;
  erreursActives: { type: string; description: string }[];
  historique: FeynmanTour[];
  dernierTranscript: string;
  brouillon: string;
}

export interface FeynmanTurnContext {
  points: { intitule: string; attendu: string; piegeAssocie?: string | null }[];
  contenuSection: string;
  erreursActives: { type: string; description: string }[];
  historique: FeynmanTour[];
  dernierTranscript: string;
  brouillon: string;
}

export function buildFeynmanTurnContext(input: FeynmanTurnContextInput): FeynmanTurnContext {
  return {
    points: input.points.map((p) => ({ intitule: p.intitule, attendu: p.attendu, piegeAssocie: p.piege_associe })),
    contenuSection: input.contenuSection,
    erreursActives: input.erreursActives.map((e) => ({ type: e.type, description: e.description })),
    historique: input.historique.map((h) => ({ role: h.role, texte: h.texte })),
    dernierTranscript: input.dernierTranscript,
    brouillon: input.brouillon,
  };
}
