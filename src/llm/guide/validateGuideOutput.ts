import type { GuideOutput } from "@/llm/schemas/guide";

// L2 · validation post-LLM (FUNCTIONS §2, PLAN Phase 4) — chaque segment gras de
// la section doit être couvert par ≥ 1 point de contrôle. Le point critique est
// déjà imposé par guideOutputSchema (zod refine) ; ceci couvre le reste du contrat,
// qui dépend de données externes au schéma (le nombre de segments gras envoyés).
// Numérotation 1-based : rubrique.v1.md numérote les segments gras à partir de 1.

export function validateGrasCoverage(output: GuideOutput, boldSegmentCount: number): string | null {
  const covered = new Set(output.points.flatMap((p) => p.segments_couverts));
  const missing = Array.from({ length: boldSegmentCount }, (_, i) => i + 1).filter((n) => !covered.has(n));

  if (missing.length === 0) return null;
  return `Segments gras non couverts par un point de contrôle : segments ${missing.join(", ")}.`;
}
