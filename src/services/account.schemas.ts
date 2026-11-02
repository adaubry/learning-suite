import { z } from "zod";

// Schémas partagés Server Actions ↔ formulaires.

// Champ texte optionnel de formulaire : "" -> undefined (au lieu d'une chaîne vide persistée).
const optionalText = () =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined));

export const subjectInputSchema = z.object({
  nom: z.string().trim().min(1, "Nom requis"),
  semestre: z.string().trim().min(1, "Semestre requis"),
  dateExamen: optionalText(),
});
export type SubjectInput = z.infer<typeof subjectInputSchema>;

// `limiter` absent (case décochée) ⇒ aucun plafond.
export const plannerConfigInputSchema = z
  .object({
    limiter: z.literal("on").optional(),
    nouvellesParJour: z.coerce.number().int().min(1).max(50),
  })
  .transform(({ limiter, nouvellesParJour }) => ({ nouvellesParJour: limiter ? nouvellesParJour : null }));
export type PlannerConfigInput = z.infer<typeof plannerConfigInputSchema>;
