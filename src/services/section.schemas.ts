import { z } from "zod";

// Schémas partagés Server Actions ↔ U13 TriageList (FUNCTIONS §4).

const importanceSchema = z.number().int().min(1).max(5);
const titreSchema = z.string().trim().min(1, "Titre requis.");

// L'ordre du tableau EST l'ordre final des sections (É1.4 : dérivé des bornes du
// document, non éditable — DECISIONS.md bloc 3.3) : chaque section vivante, touchée
// ou non, apparaît une fois comme "keep" à sa position, la logique repose sur ça
// pour reconstruire `ordre` sans étape de renumérotation séparée.
export const triageOperationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("keep"),
    sectionId: z.string().uuid(),
    titre: titreSchema,
    importance: importanceSchema,
  }),
  z.object({
    kind: z.literal("merge"),
    sectionIds: z.tuple([z.string().uuid(), z.string().uuid()]),
    titre: titreSchema,
    importance: importanceSchema,
  }),
  z.object({
    kind: z.literal("split"),
    sectionId: z.string().uuid(),
    cutOffset: z.number().int().positive(),
    titres: z.tuple([titreSchema, titreSchema]),
    importances: z.tuple([importanceSchema, importanceSchema]),
  }),
]);
export type TriageOperation = z.infer<typeof triageOperationSchema>;

export const applyTriageInputSchema = z.object({
  chapterId: z.string().uuid(),
  operations: z.array(triageOperationSchema).min(1),
});
export type ApplyTriageInput = z.infer<typeof applyTriageInputSchema>;
