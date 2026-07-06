import { z } from "zod";

// L2 · generateGuide — sortie (FUNCTIONS §2 L2, ARCHITECTURE §9 ligne 2, prompts/rubrique.v1.md).
// segments_couverts référence les numéros 1-based des segments gras tels que
// numérotés dans le prompt — rend la couverture vérifiable par le code plutôt
// que par un rapprochement de texte. Noms de champs en snake_case : ce sont
// exactement ceux demandés au modèle dans rubrique.v1.md.

export const controlPointSchema = z.object({
  type: z.enum(["critique", "important", "secondaire"]),
  intitule: z.string().min(1),
  attendu: z.string().min(1),
  piege_associe: z.string().nullish(),
  segments_couverts: z.array(z.number().int().positive()).default([]),
});

export const guideOutputSchema = z
  .object({ points: z.array(controlPointSchema).min(1) })
  .refine((v) => v.points.some((p) => p.type === "critique"), {
    message: "La rubrique doit contenir au moins un point critique.",
    path: ["points"],
  });

export type ControlPoint = z.infer<typeof controlPointSchema>;
export type GuideOutput = z.infer<typeof guideOutputSchema>;
