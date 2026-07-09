import { streamCompletion } from "@/llm/client";
import type { FeynmanTurnContext } from "@/llm/context/feynmanTurn";

// L4 · feynmanTurn (FUNCTIONS §2, PLAN Bloc 7.2) — relance socratique streamée.
// feynman_turn.v2.md attend ses variables en snake_case ; historique/points sont
// pré-formatés en lignes de texte ici (formatTemplateItem de L0 ne reconnaît que
// la forme {type, description}, pas {role, texte} ni {intitule, attendu}).

function toPromptVariables(context: FeynmanTurnContext) {
  return {
    points: context.points.map((p) =>
      p.piegeAssocie
        ? `${p.intitule} — attendu : ${p.attendu} (piège possible : ${p.piegeAssocie})`
        : `${p.intitule} — attendu : ${p.attendu}`,
    ),
    contenu_section: context.contenuSection,
    erreurs_actives: context.erreursActives,
    historique: context.historique.map((h) => (h.role === "etudiant" ? `Étudiant : ${h.texte}` : `IA : ${h.texte}`)),
    dernier_transcript: context.dernierTranscript,
  };
}

export function feynmanTurn(context: FeynmanTurnContext): AsyncGenerator<string> {
  return streamCompletion({
    appel: "feynman",
    promptVersion: "v2",
    promptFile: "feynman_turn",
    context: toPromptVariables(context),
  });
}
