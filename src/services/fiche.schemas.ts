import { z } from "zod";

// Schémas des Server Actions d'import (validation d'entrée seulement).

export const importInputSchema = z.object({
  subjectId: z.string().uuid("Choisis une matière."),
  titre: z.string().trim().min(1, "Titre du set requis"),
  markdown: z.string().trim().min(1, "Le document est vide."),
});

export const reimportInputSchema = z.object({
  setId: z.string().uuid(),
  markdown: z.string().trim().min(1, "Le document est vide."),
});
