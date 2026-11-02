import type { PointFiche } from "@/core/fiche/extractPoints";

// ContextBuilder de la correction (ARCHITECTURE.md v2 §7) — pur. Points de la
// fiche (déjà dérivés en code, compléments hors cours exclus), blurting, n° de
// tentative, erreurs actives de la fiche (détection de récidive). Ni ids, ni
// statuts bruts : seulement ce que le prompt consomme.

export interface CorrectionContextInput {
  points: PointFiche[];
  blurting: string;
  tentative: number;
  erreursActives: { id: string; type: string; description: string }[];
}

export interface CorrectionContext {
  points: { type: PointFiche["type"]; raisonnement: boolean; intitule: string; attendu: string }[];
  blurting: string;
  tentative: number;
  erreursActives: { type: string; description: string }[];
}

export function buildCorrectionContext(input: CorrectionContextInput): CorrectionContext {
  return {
    points: input.points.map((p) => ({
      type: p.type,
      raisonnement: p.raisonnement,
      intitule: p.intitule,
      attendu: p.attendu,
    })),
    blurting: input.blurting,
    tentative: input.tentative,
    erreursActives: input.erreursActives.map((e) => ({ type: e.type, description: e.description })),
  };
}
