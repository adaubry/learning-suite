import type { FeynmanBilanOutput } from "@/llm/schemas/feynman";

// L5 · validation post-LLM (PLAN Bloc 7.2) — même garantie que L3/validateCorrectionOutput :
// le bilan couvre TOUS les points de la rubrique, chacun exactement une fois — un
// point omis ne doit jamais être silencieusement traité comme "démontré".

export function validateFeynmanBilanOutput(output: FeynmanBilanOutput, pointCount: number): string | null {
  const indices = output.points.map((p) => p.point_index);
  const horsBornes = indices.filter((i) => i < 1 || i > pointCount);
  if (horsBornes.length > 0) {
    return `point_index hors bornes (rubrique de ${pointCount} points) : ${horsBornes.join(", ")}.`;
  }

  const vus = new Set(indices);
  const manquants = Array.from({ length: pointCount }, (_, i) => i + 1).filter((n) => !vus.has(n));
  if (manquants.length > 0) {
    return `Points de la rubrique absents du bilan : ${manquants.join(", ")}. Chaque point doit apparaître exactement une fois.`;
  }
  if (vus.size !== indices.length) {
    return "Un ou plusieurs point_index apparaissent en double dans le bilan : chaque point doit apparaître exactement une fois.";
  }

  return null;
}
