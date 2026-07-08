import type { EmphasisSegment, TitleNode } from "@/core/parser/types";
import { selectCandidateHeadings } from "@/core/sectioning/candidateHeadings";
import { validateSectionCoverage } from "@/core/sectioning/validateSectionCoverage";
import { callLLM } from "@/llm/client";
import { buildSectionnementContext, type SectionnementContext } from "@/llm/context/sectionnement";
import { sectionnementOutputSchema } from "@/llm/schemas/sectionnement";

// L1 · proposeSectioning (FUNCTIONS §2) — bornes résolues depuis les indices du
// plan (jamais un comptage de caractères par le modèle) ; couverture vérifiée à
// chaque tentative, callLLM réinjecte l'erreur et retry. Chapitre sans aucun
// titre exploitable ⇒ échec immédiat, le secours P6 est la responsabilité de
// l'appelant (FUNCTIONS §2 : « échec final ⇒ P6 proposé »).

export interface ProposeSectioningInput {
  markdown: string;
  titleTree: TitleNode[];
  italicSegments: EmphasisSegment[];
  matiere: string;
  chapitre: string;
  methodologieTitres: string;
}

export interface ProposedSection {
  titre: string;
  start: number;
  end: number;
  justification: string;
}

function toPromptVariables(context: SectionnementContext) {
  return {
    matiere: context.matiere,
    chapitre: context.chapitre,
    methodologie_titres: context.methodologieTitres,
    contenu: context.contenu,
    plan: context.plan,
  };
}

export class AucunTitreExploitableError extends Error {
  constructor() {
    super("Aucun titre exploitable pour le sectionnement (secours P6 attendu).");
  }
}

export async function proposeSectioning(input: ProposeSectioningInput): Promise<ProposedSection[]> {
  const candidates = selectCandidateHeadings(input.titleTree);
  if (candidates.length === 0) throw new AucunTitreExploitableError();

  const context = buildSectionnementContext({ ...input, candidates });

  const output = await callLLM({
    appel: "sectionnement",
    promptVersion: "v1",
    schema: sectionnementOutputSchema,
    context: toPromptVariables(context),
    validate: (data) => validateSectionCoverage(data, candidates.length),
  });

  return output.sections.map((s) => ({
    titre: s.titre_labelise,
    start: candidates[s.debut_index - 1].start,
    end: candidates[s.fin_index - 1].end,
    justification: s.justification,
  }));
}
