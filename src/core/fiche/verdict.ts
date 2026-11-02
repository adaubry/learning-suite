import type { PointFiche } from "./extractPoints";

// Auto-évaluation (ARCHITECTURE.md v2 §2) — pur. L'étudiant compare son blurting à
// la fiche et coche les points qu'il a restitués ; le bilan et le verdict se
// calculent ici, sans LLM. Le verdict met un bouton en avant, il ne décide rien.

export type Verdict = "bon" | "insuffisant";
export type ErreurType = "omission" | "deformation" | "confusion" | "imprecision";

export interface Compte {
  couverts: number;
  total: number;
}

export interface BilanAutoEvaluation {
  verdict: Verdict;
  points: Compte;
  /** Points critiques : thèse, Définition, Texte. */
  essentiels: Compte;
  /** Points Cause / Conséquence / Logique. */
  raisonnement: Compte;
}

// Indices cochés valides, sans doublon, triés — l'entrée vient d'un formulaire.
export function normaliserCoches(coches: number[], nbPoints: number): number[] {
  return [...new Set(coches.filter((i) => Number.isInteger(i) && i >= 0 && i < nbPoints))].sort((a, b) => a - b);
}

export function bilanAutoEvaluation(points: PointFiche[], coches: number[]): BilanAutoEvaluation {
  const cochés = new Set(normaliserCoches(coches, points.length));
  const compte = (filtre: (p: PointFiche) => boolean): Compte => {
    const indices = points.flatMap((p, i) => (filtre(p) ? [i] : []));
    return { couverts: indices.filter((i) => cochés.has(i)).length, total: indices.length };
  };
  const essentiels = compte((p) => p.type === "critique");
  return {
    verdict: essentiels.couverts < essentiels.total ? "insuffisant" : "bon",
    points: compte(() => true),
    essentiels,
    raisonnement: compte((p) => p.raisonnement),
  };
}
