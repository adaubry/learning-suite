import { callLLM } from "@/llm/client";
import { feynmanBilanOutputSchema, type FeynmanBilanOutput } from "@/llm/schemas/feynman";
import { validateFeynmanBilanOutput } from "@/llm/feynman/validateFeynmanBilanOutput";
import type { FeynmanBilanContext } from "@/llm/context/feynmanBilan";

// L5 · feynmanReport (FUNCTIONS §2, PLAN Bloc 7.2) — bilan structuré de clôture.
// feynman_bilan.v1.md attend ses variables en snake_case ; historique/points
// pré-formatés en lignes de texte (même raison que feynmanTurn.ts).

function toPromptVariables(context: FeynmanBilanContext) {
  return {
    points: context.points.map((p) => `${p.intitule} — attendu : ${p.attendu}`),
    historique: context.historique.map((h) => (h.role === "etudiant" ? `Étudiant : ${h.texte}` : `IA : ${h.texte}`)),
  };
}

export function feynmanReport(context: FeynmanBilanContext): Promise<FeynmanBilanOutput> {
  return callLLM({
    appel: "feynman",
    promptVersion: "v1",
    promptFile: "feynman_bilan",
    schema: feynmanBilanOutputSchema,
    context: toPromptVariables(context),
    validate: (data) => validateFeynmanBilanOutput(data, context.points.length),
  });
}
