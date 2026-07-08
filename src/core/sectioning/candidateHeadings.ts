import type { TitleNode } from "@/core/parser/types";

// Sectionnement (FUNCTIONS §1 P6, §2 L1) — les candidats de découpage sont les
// titres de niveau 2 (FORMAT §2.1 : « Grande partie »), sinon les titres de
// niveau 1 s'il n'y en a aucun. `start`/`end` de chaque TitleNode sont déjà les
// bornes exactes de sa portée (calculées par P1) : aucun recalcul nécessaire.

function flattenByLevel(nodes: TitleNode[], level: TitleNode["level"]): TitleNode[] {
  return nodes.flatMap((n) => (n.level === level ? [n] : flattenByLevel(n.children, level)));
}

export function selectCandidateHeadings(titleTree: TitleNode[]): TitleNode[] {
  const titre2 = flattenByLevel(titleTree, 2);
  if (titre2.length > 0) return titre2;
  return flattenByLevel(titleTree, 1);
}
