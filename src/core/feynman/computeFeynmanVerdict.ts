// P · computeFeynmanVerdict (FUNCTIONS §2 L5, USER_FLOW É3.4) — pur : « acquis = tous
// les points CRITIQUES démontrés » — récité seul ne suffit pas pour un critique
// (l'exigence supplémentaire du Feynman est l'explication, pas la restitution).
// Calculé en code plutôt que retourné par le LLM, même doctrine que
// core/correction/verdict.computeVerdict (DECISIONS.md bloc 5.1).

export type PointType = "critique" | "important" | "secondaire";
export type BilanPointStatut = "demontre" | "recite" | "non_aborde";

export interface BilanPoint {
  type: PointType;
  statut: BilanPointStatut;
}

export function computeFeynmanVerdict(points: BilanPoint[]): "acquis" | "insuffisant" {
  const critiqueDefaillant = points.some((p) => p.type === "critique" && p.statut !== "demontre");
  return critiqueDefaillant ? "insuffisant" : "acquis";
}
