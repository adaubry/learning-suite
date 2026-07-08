import { z } from "zod";

// L3 · correctBlurting — sortie (FUNCTIONS §2 L3, ARCHITECTURE §9 ligne 3+4,
// prompts/correction_erreurs.v1.md). `point_index` référence le rang 1-based du
// point de contrôle tel que numéroté dans le prompt (même convention que
// `segments_couverts` en L2 — un LLM compte mal, la résolution vers le vrai point
// se fait en code). `recidive_index` référence de la même façon le rang de
// l'erreur active fournie en contexte — jamais un id brut à faire correspondre par
// texte. Pas de champ verdict : calculé en code depuis `diff` (P10.computeVerdict,
// DECISIONS.md bloc 5.1).

export const diffPointSchema = z.object({
  point_index: z.number().int().positive(),
  statut: z.enum(["couvert", "manquant", "deforme"]),
  explication: z.string().min(1),
});

export const erreurCandidateSchema = z.object({
  type: z.enum(["omission", "deformation", "confusion", "imprecision"]),
  description: z.string().min(1),
  recidive_index: z.number().int().positive().nullish(),
});

export const correctionOutputSchema = z.object({
  diff: z.array(diffPointSchema).min(1),
  erreurs_candidates: z.array(erreurCandidateSchema).default([]),
});

export type CorrectionOutput = z.infer<typeof correctionOutputSchema>;
