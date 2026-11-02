import { z } from "zod";

// Sortie de correctBlurting (ARCHITECTURE.md v2 §7, prompts/correction_fiche.v1.md).
// `point_index` = rang 1-based du point tel que numéroté dans le prompt ;
// `recidive_index` = rang de l'erreur active fournie. Un LLM compte mal : la
// résolution vers le vrai point / la vraie erreur se fait en code. Pas de verdict :
// calculé en code (core/fiche/verdict).

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
