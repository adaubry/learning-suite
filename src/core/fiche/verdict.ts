import type { PointFiche } from "./extractPoints";

// Verdict de correction (ARCHITECTURE.md v2 §2) — pur, calculé en code depuis le
// statut de chaque point, jamais demandé au LLM. Il choisit le bouton mis en
// avant ; l'utilisateur décide.

export type PointStatut = "couvert" | "manquant" | "deforme";
export type Verdict = "bon" | "insuffisant";

export interface PointCorrige extends PointFiche {
  statut: PointStatut;
  explication: string;
}

export type ErreurType = "omission" | "deformation" | "confusion" | "imprecision";

export interface ErreurCandidate {
  type: ErreurType;
  description: string;
  /** Erreur active déjà au carnet dont celle-ci est la récidive. */
  idErreurExistante: string | null;
}

export function computeVerdict(points: PointCorrige[]): Verdict {
  const critiqueDefaillant = points.some((p) => p.type === "critique" && p.statut !== "couvert");
  return critiqueDefaillant ? "insuffisant" : "bon";
}

export function resumeRaisonnement(points: PointCorrige[]): { couverts: number; total: number } {
  const raisonnement = points.filter((p) => p.raisonnement);
  return { couverts: raisonnement.filter((p) => p.statut === "couvert").length, total: raisonnement.length };
}
