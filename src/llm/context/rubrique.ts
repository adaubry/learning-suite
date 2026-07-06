import type { EmphasisSegment } from "@/core/parser/types";

// L2 · ContextBuilder Rubrique (ARCHITECTURE §9 ligne 2) — fonction pure : projette
// les lignes DB brutes (qui portent ids/statuts/positions) vers exactement le
// contrat autorisé. Le canary vérifie qu'aucune clé en plus ne fuit (ids, statuts…).

export interface RubriqueContextInput {
  section: {
    titre: string;
    contenu: string;
    segmentsGras: EmphasisSegment[];
    commentaires: EmphasisSegment[];
  };
  matiere: string;
  chapitre: string;
  erreursActives: { type: string; description: string }[];
}

export interface RubriqueContext {
  matiere: string;
  chapitre: string;
  titreSection: string;
  contenu: string;
  segmentsGras: string[];
  commentaires: string[];
  erreursActives: { type: string; description: string }[];
}

export function buildRubriqueContext(input: RubriqueContextInput): RubriqueContext {
  return {
    matiere: input.matiere,
    chapitre: input.chapitre,
    titreSection: input.section.titre,
    contenu: input.section.contenu,
    segmentsGras: input.section.segmentsGras.map((s) => s.text),
    commentaires: input.section.commentaires.map((s) => s.text),
    erreursActives: input.erreursActives.map((e) => ({ type: e.type, description: e.description })),
  };
}
