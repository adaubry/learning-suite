"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth";
import * as chapter from "@/services/chapter";
import * as section from "@/services/section";
import { chapterAnalyzeInputSchema, chapterImportInputSchema } from "@/services/chapter.schemas";
import { applyTriageInputSchema } from "@/services/section.schemas";

// Adaptateurs minces S1.import (FUNCTIONS §4) — U23 ImportWizard, étapes É1.1/É1.2.

export async function analyzeChapterAction(_prevState: unknown, formData: FormData) {
  const parsed = chapterAnalyzeInputSchema.safeParse({ markdown: formData.get("markdown") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  await requireUserId();
  const { anomalies } = chapter.analyzeMarkdown(parsed.data.markdown);
  return { success: true as const, markdown: parsed.data.markdown, anomalies };
}

export async function importChapterAction(_prevState: unknown, formData: FormData) {
  const acknowledgedAnomalyKeys = JSON.parse(
    String(formData.get("acknowledgedAnomalyKeys") ?? "[]"),
  );
  const parsed = chapterImportInputSchema.safeParse({
    subjectId: formData.get("subjectId"),
    titre: formData.get("titre"),
    markdown: formData.get("markdown"),
    acknowledgedAnomalyKeys,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const userId = await requireUserId();
  let created: { id: string };
  try {
    created = await chapter.importChapter(userId, parsed.data);
  } catch (err) {
    if (err instanceof chapter.AnomaliesNonAcquitteesError) {
      return { error: err.message };
    }
    throw err;
  }
  redirect(`/importer?step=sectionnement&chapterId=${created.id}`);
}

// Adaptateur mince S2.propose (FUNCTIONS §4) — U23, étape É1.3 : déclenché par
// l'arrivée sur l'écran de sectionnement, pas par le bouton d'import (écran
// d'attente dédié, USER_FLOW É1.3 — DECISIONS.md bloc 3.3).
export async function proposeSectioningAction(_prevState: unknown, formData: FormData) {
  const chapterId = String(formData.get("chapterId") ?? "");
  if (!chapterId) return { error: "Chapitre manquant." };

  const userId = await requireUserId();
  try {
    const { sections, method } = await section.propose(userId, chapterId);
    return { success: true as const, sections, method };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Échec du sectionnement." };
  }
}

// Adaptateur mince S2.applyTriage (FUNCTIONS §4) — U23, étape É1.4.
export async function applyTriageAction(_prevState: unknown, formData: FormData) {
  const chapterId = String(formData.get("chapterId") ?? "");
  const operations = JSON.parse(String(formData.get("operations") ?? "[]"));
  const parsed = applyTriageInputSchema.safeParse({ chapterId, operations });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const userId = await requireUserId();
  await section.applyTriage(userId, parsed.data);
  revalidatePath("/curriculum");
  redirect("/curriculum");
}
