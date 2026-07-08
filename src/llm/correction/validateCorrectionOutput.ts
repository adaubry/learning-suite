import type { CorrectionOutput } from "@/llm/schemas/correction";

// L3 · validation post-LLM (FUNCTIONS §2, PLAN Bloc 5.1) — deux garanties que le
// schéma Zod seul ne peut pas vérifier (elles dépendent du nombre de points/erreurs
// réellement envoyés au modèle) :
//   1. le diff couvre TOUS les points de la rubrique, chacun exactement une fois —
//      un point omis ne doit JAMAIS être silencieusement traité comme couvert ;
//   2. tout `recidive_index` référence une erreur active réellement fournie.
// Numérotation 1-based : correction_erreurs.v1.md numérote points et erreurs à
// partir de 1 (même convention que segments_couverts en L2).

export function validateCorrectionOutput(
  output: CorrectionOutput,
  pointCount: number,
  erreursActivesCount: number,
): string | null {
  const indices = output.diff.map((d) => d.point_index);
  const horsBornes = indices.filter((i) => i < 1 || i > pointCount);
  if (horsBornes.length > 0) {
    return `point_index hors bornes (rubrique de ${pointCount} points) : ${horsBornes.join(", ")}.`;
  }

  const vus = new Set(indices);
  const manquants = Array.from({ length: pointCount }, (_, i) => i + 1).filter((n) => !vus.has(n));
  if (manquants.length > 0) {
    return `Points de la rubrique absents du diff : ${manquants.join(", ")}. Chaque point doit apparaître exactement une fois.`;
  }
  if (vus.size !== indices.length) {
    return "Un ou plusieurs point_index apparaissent en double dans le diff : chaque point doit apparaître exactement une fois.";
  }

  const recidivesHorsBornes = output.erreurs_candidates
    .map((e) => e.recidive_index)
    .filter((i): i is number => i != null && (i < 1 || i > erreursActivesCount));
  if (recidivesHorsBornes.length > 0) {
    return `recidive_index hors bornes (${erreursActivesCount} erreurs actives fournies) : ${recidivesHorsBornes.join(", ")}.`;
  }

  return null;
}
