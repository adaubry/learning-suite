import { z } from "zod";

// Schémas partagés Server Actions ↔ formulaires (FUNCTIONS §4) — wizard d'import (U23).

export const chapterAnalyzeInputSchema = z.object({
  markdown: z.string().trim().min(1, "Le document est vide."),
});
export type ChapterAnalyzeInput = z.infer<typeof chapterAnalyzeInputSchema>;

export const chapterImportInputSchema = z.object({
  subjectId: z.string().uuid("Matière requise."),
  titre: z.string().trim().min(1, "Titre requis."),
  markdown: z.string().trim().min(1, "Le document est vide."),
  acknowledgedAnomalyKeys: z.array(z.string()),
});
export type ChapterImportInput = z.infer<typeof chapterImportInputSchema>;
