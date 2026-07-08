import type { TitleNode } from "@/core/parser/types";
import { selectCandidateHeadings } from "./candidateHeadings";

// P6 · mechanicalSectioning (FUNCTIONS §1) — secours sans LLM : une section par
// Titre 2, sinon par Titre 1, sinon le chapitre entier. Jamais bloquant.

export interface MechanicalSection {
  titre: string;
  start: number;
  end: number;
}

export function mechanicalSectioning(titleTree: TitleNode[], sourceLength: number): MechanicalSection[] {
  const candidates = selectCandidateHeadings(titleTree);
  if (candidates.length === 0) {
    return [{ titre: "Chapitre entier", start: 0, end: sourceLength }];
  }
  return candidates.map((n) => ({ titre: n.text, start: n.start, end: n.end }));
}
