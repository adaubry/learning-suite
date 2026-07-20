import { z } from "zod";

// Schémas partagés Server Actions ↔ formulaires (FUNCTIONS §4) — écran Régularité,
// formulaire DeadlineChecklist (IMPLEMENT_SCHEDULE.md §7).

const optionalUuid = () =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .optional();

export const deadlineInputSchema = z.object({
  subjectId: optionalUuid(),
  type: z.enum(["examen", "controle_continu", "autre"]),
  libelle: z.string().trim().min(1, "Libellé requis."),
  dueDate: z.string().trim().min(1, "Date requise."),
  coefficient: z.coerce.number().positive().optional(),
  dureeMin: z.coerce.number().int().positive().optional(),
  // Récurrence hebdomadaire (§7 « récurrence hebdo × n occurrences qui déplie
  // les lignes ») : n occurrences espacées de 7 jours à partir de dueDate,
  // partageant un recurrenceGroupId. 1 = pas de récurrence.
  occurrences: z.coerce.number().int().min(1).max(52).default(1),
});
export type DeadlineInput = z.infer<typeof deadlineInputSchema>;

export const deadlineUpdateInputSchema = deadlineInputSchema.omit({ occurrences: true }).partial().extend({
  id: z.string().uuid(),
});
export type DeadlineUpdateInput = z.infer<typeof deadlineUpdateInputSchema>;
