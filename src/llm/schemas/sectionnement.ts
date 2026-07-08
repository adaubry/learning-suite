import { z } from "zod";

// L1 · proposeSectioning — sortie (FUNCTIONS §2 L1, ARCHITECTURE §9 ligne 1,
// prompts/sectionnement.v1.md). debut_index/fin_index référencent les numéros
// 1-based du `plan` (candidateHeadings) tel que numéroté dans le prompt — la
// résolution en offsets réels se fait côté code (validateSectionCoverage),
// jamais par comptage de caractères du modèle.

export const sectionnementSectionSchema = z.object({
  debut_index: z.number().int().positive(),
  fin_index: z.number().int().positive(),
  titre_labelise: z.string().min(1),
  justification: z.string().min(1),
});

export const sectionnementOutputSchema = z.object({
  sections: z.array(sectionnementSectionSchema).min(1),
});

export type SectionnementSection = z.infer<typeof sectionnementSectionSchema>;
export type SectionnementOutput = z.infer<typeof sectionnementOutputSchema>;
