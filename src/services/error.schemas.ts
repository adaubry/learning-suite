import { z } from "zod";

// Ajout manuel d'une erreur au carnet depuis l'écran de comparaison.
export const addErrorInputSchema = z.object({
  tentativeId: z.string().uuid(),
  type: z.enum(["omission", "deformation", "confusion", "imprecision"]),
  description: z.string().trim().min(1, "Décris l'erreur."),
});
