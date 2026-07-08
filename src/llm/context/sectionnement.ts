import type { EmphasisSegment, TitleNode } from "@/core/parser/types";

// L1 · ContextBuilder Sectionnement (ARCHITECTURE §9 ligne 1) — fonction pure :
// projette vers exactement le contrat autorisé. Le canary vérifie qu'aucune clé
// en plus ne fuit. `plan` liste les candidats de découpage (candidateHeadings)
// dans l'ordre du document — leur position dans ce tableau EST le numéro que le
// modèle utilisera en sortie (1-based, via le rendu générique de callLLM).

export interface SectionnementContextInput {
  markdown: string;
  italicSegments: EmphasisSegment[];
  candidates: TitleNode[];
  matiere: string;
  chapitre: string;
  methodologieTitres: string;
}

export interface SectionnementContext {
  matiere: string;
  chapitre: string;
  methodologieTitres: string;
  contenu: string;
  plan: string[];
}

function stripItalics(markdown: string, italicSegments: EmphasisSegment[]): string {
  const sorted = [...italicSegments].sort((a, b) => a.start - b.start);
  let result = "";
  let cursor = 0;
  for (const seg of sorted) {
    result += markdown.slice(cursor, seg.start);
    cursor = seg.end;
  }
  result += markdown.slice(cursor);
  return result;
}

export function buildSectionnementContext(input: SectionnementContextInput): SectionnementContext {
  return {
    matiere: input.matiere,
    chapitre: input.chapitre,
    methodologieTitres: input.methodologieTitres,
    contenu: stripItalics(input.markdown, input.italicSegments),
    plan: input.candidates.map((n) => `${n.text} (Titre ${n.level})`),
  };
}
