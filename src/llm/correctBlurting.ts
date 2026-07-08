import { callLLM } from "@/llm/client";
import { correctionOutputSchema, type CorrectionOutput } from "@/llm/schemas/correction";
import type { CorrectionContext } from "@/llm/context/correction";
import { validateCorrectionOutput } from "@/llm/correction/validateCorrectionOutput";

// L3 · correctBlurting (FUNCTIONS §2) — corrige un blurting contre la rubrique
// validée et détecte les erreurs candidates. Couverture complète du diff et
// bornes des index de récidive vérifiées à chaque tentative (même boucle de
// retry que les erreurs de schéma, cf. validateCorrectionOutput).

// correction_erreurs.v1.md attend ses variables en snake_case ; rubrique_points et
// erreurs_actives sont des tableaux numérotés automatiquement par L0 (1-based) —
// c'est ce numéro que le modèle doit réutiliser dans point_index/recidive_index.
function toPromptVariables(context: CorrectionContext) {
  return {
    tentative: context.tentative,
    rubrique_points: context.points.map((p) =>
      p.piegeAssocie
        ? `${p.intitule} — attendu : ${p.attendu} (piège possible : ${p.piegeAssocie})`
        : `${p.intitule} — attendu : ${p.attendu}`,
    ),
    erreurs_actives: context.erreursActives,
    blurting: context.blurting,
  };
}

export function correctBlurting(context: CorrectionContext): Promise<CorrectionOutput> {
  return callLLM({
    appel: "correction_erreurs",
    promptVersion: "v1",
    schema: correctionOutputSchema,
    context: toPromptVariables(context),
    validate: (data) => validateCorrectionOutput(data, context.points.length, context.erreursActives.length),
  });
}
