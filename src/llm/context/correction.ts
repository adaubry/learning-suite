import type { ControlPoint } from "@/llm/schemas/guide";

// L3 · ContextBuilder Correction (ARCHITECTURE §9 ligne 3+4) — fonction pure :
// rubrique validée + blurting + erreurs actives DE LA SECTION (pas de la matière,
// contrairement à L2 — détection de récidive sur la même section) + n° de
// tentative. JAMAIS `section.contenu` : le canary vérifie qu'aucune clé du cours
// ne fuit dans le contexte envoyé au modèle.

export interface CorrectionContextInput {
  points: ControlPoint[];
  blurting: string;
  tentative: number;
  erreursActives: { id: string; type: string; description: string }[];
}

export interface CorrectionContext {
  points: { intitule: string; attendu: string; piegeAssocie?: string | null }[];
  blurting: string;
  tentative: number;
  erreursActives: { type: string; description: string }[];
}

export function buildCorrectionContext(input: CorrectionContextInput): CorrectionContext {
  return {
    points: input.points.map((p) => ({
      intitule: p.intitule,
      attendu: p.attendu,
      piegeAssocie: p.piege_associe,
    })),
    blurting: input.blurting,
    tentative: input.tentative,
    erreursActives: input.erreursActives.map((e) => ({ type: e.type, description: e.description })),
  };
}
