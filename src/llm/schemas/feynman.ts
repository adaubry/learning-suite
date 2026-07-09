import { z } from "zod";

// L5 · feynmanReport — sortie (FUNCTIONS §2 L5, ARCHITECTURE §9 ligne 5,
// prompts/feynman_bilan.v1.md). `point_index` référence le rang 1-based du point
// de contrôle tel que numéroté dans le prompt — même convention que L2/L3 (un LLM
// compte mal, la résolution vers le vrai point/son `type` se fait en code). Pas de
// champ verdict : calculé en code depuis `points` (computeFeynmanVerdict).

export const bilanPointSchema = z.object({
  point_index: z.number().int().positive(),
  statut: z.enum(["demontre", "recite", "non_aborde"]),
  commentaire: z.string().min(1),
});

export const feynmanBilanOutputSchema = z.object({
  points: z.array(bilanPointSchema).min(1),
  points_solides: z.array(z.string()).default([]),
  lacunes: z.array(z.string()).default([]),
});

export type FeynmanBilanOutput = z.infer<typeof feynmanBilanOutputSchema>;
