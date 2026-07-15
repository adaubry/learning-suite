// verdict (FUNCTIONS §1, ARCHITECTURE §5) — calcul du verdict acquis/insuffisant
// depuis le diff de correction. Anciennement hébergé dans presentCorrection.ts
// (P10, supprimée avec la divulgation contrôlée — REVAMP.md v0.3, 2026-07-15 :
// divulgation toujours complète, plus rien à filtrer) : ce fichier reprend le
// seul morceau qui survit, `computeVerdict`, ainsi que les types de correction
// fusionnés (Filtered*/Merged* n'ont plus de raison d'être distincts).

export type PointType = "critique" | "important" | "secondaire";
export type PointStatut = "couvert" | "manquant" | "deforme";

export interface MergedDiffPoint {
  intitule: string;
  type: PointType;
  statut: PointStatut;
  attendu: string;
  explication: string;
}

export type ErreurType = "omission" | "deformation" | "confusion" | "imprecision";

export interface MergedErrorCandidate {
  type: ErreurType;
  description: string;
  idErreurExistante: string | null;
}

// verdict = "insuffisant" si un point CRITIQUE est manquant OU déformé (une
// définition déformée est au moins aussi grave qu'une définition absente) —
// calculé en code depuis le diff plutôt que retourné par le modèle (DECISIONS.md,
// bloc 5.1).
export function computeVerdict(diff: MergedDiffPoint[]): "acquis" | "insuffisant" {
  const critiqueDefaillant = diff.some(
    (p) => p.type === "critique" && (p.statut === "manquant" || p.statut === "deforme"),
  );
  return critiqueDefaillant ? "insuffisant" : "acquis";
}
