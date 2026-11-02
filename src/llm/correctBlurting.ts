import { callLLM } from "@/llm/client";
import { correctionOutputSchema, type CorrectionOutput } from "@/llm/schemas/correction";
import type { CorrectionContext } from "@/llm/context/correction";
import { validateCorrectionOutput } from "@/llm/correction/validateCorrectionOutput";

// correctBlurting (ARCHITECTURE.md v2 §7) — l'unique appel LLM de l'app : corrige
// un blurting contre les points de la fiche et relève les erreurs candidates.
// Couverture complète du diff et bornes des index vérifiées à chaque tentative
// (même boucle de retry que les erreurs de schéma).

// Les tableaux sont numérotés 1-based par L0 : c'est ce numéro que le modèle
// réutilise dans point_index/recidive_index.
function toPromptVariables(context: CorrectionContext) {
  return {
    tentative: context.tentative,
    points: context.points.map(
      (p) => `[${p.type}]${p.raisonnement ? " [raisonnement]" : ""} ${p.intitule} — attendu : ${p.attendu}`,
    ),
    erreurs_actives: context.erreursActives,
    blurting: context.blurting,
  };
}

export function correctBlurting(context: CorrectionContext): Promise<CorrectionOutput> {
  return callLLM({
    appel: "correction_erreurs",
    promptFile: "correction_fiche",
    promptVersion: "v1",
    schema: correctionOutputSchema,
    context: toPromptVariables(context),
    validate: (data) => validateCorrectionOutput(data, context.points.length, context.erreursActives.length),
  });
}
