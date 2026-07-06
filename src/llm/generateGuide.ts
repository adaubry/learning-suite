import { callLLM } from "@/llm/client";
import { guideOutputSchema, type GuideOutput } from "@/llm/schemas/guide";
import type { RubriqueContext } from "@/llm/context/rubrique";
import { validateGrasCoverage } from "@/llm/guide/validateGuideOutput";

// L2 · generateGuide (FUNCTIONS §2) — génère les points de contrôle d'une section.
// Le point critique et la couverture des gras sont vérifiés à chaque tentative ;
// callLLM réinjecte l'erreur et retry (même boucle que les erreurs de schéma).

// rubrique.v1.md attend ses variables en snake_case ({{titre_section}}, {{segments_gras}}…) —
// RubriqueContext reste camelCase (contrat testé par le canary du ContextBuilder) ;
// traduction confinée ici, propre à cette version du prompt.
function toPromptVariables(context: RubriqueContext) {
  return {
    matiere: context.matiere,
    chapitre: context.chapitre,
    titre_section: context.titreSection,
    contenu_section: context.contenu,
    segments_gras: context.segmentsGras,
    commentaires: context.commentaires,
    erreurs_actives: context.erreursActives,
  };
}

export function generateGuide(context: RubriqueContext): Promise<GuideOutput> {
  return callLLM({
    appel: "rubrique",
    promptVersion: "v1",
    schema: guideOutputSchema,
    context: toPromptVariables(context),
    validate: (data) => validateGrasCoverage(data, context.segmentsGras.length),
  });
}
