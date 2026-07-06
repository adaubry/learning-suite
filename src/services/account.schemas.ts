import { z } from "zod";

// Schémas partagés Server Actions ↔ formulaires (FUNCTIONS §4).

export const subjectInputSchema = z.object({
  nom: z.string().trim().min(1, "Nom requis"),
  semestre: z.string().trim().min(1, "Semestre requis"),
  dateExamen: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type SubjectInput = z.infer<typeof subjectInputSchema>;

export const plannerConfigInputSchema = z.object({
  nouvellesParJour: z.coerce.number().int().min(1).max(10),
});
export type PlannerConfigInput = z.infer<typeof plannerConfigInputSchema>;

export const methodologieGlobaleInputSchema = z.object({
  methodologieTitresGlobale: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type MethodologieGlobaleInput = z.infer<typeof methodologieGlobaleInputSchema>;

export const subjectMethodologieInputSchema = z.object({
  methodologieTitres: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type SubjectMethodologieInput = z.infer<typeof subjectMethodologieInputSchema>;
