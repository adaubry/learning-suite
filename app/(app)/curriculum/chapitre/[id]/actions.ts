"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth";
import * as chapter from "@/services/chapter";
import * as guide from "@/services/guide";
import { chapterSimulateUpdateInputSchema } from "@/services/chapter.schemas";

// Adaptateurs minces S1.simulateUpdate/commitUpdate (FUNCTIONS §4, Bloc 8.3, É6.2).

export async function simulateUpdateAction(_prevState: unknown, formData: FormData) {
  const parsed = chapterSimulateUpdateInputSchema.safeParse({
    chapterId: formData.get("chapterId"),
    markdown: formData.get("markdown"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const userId = await requireUserId();
  try {
    const simulation = await chapter.simulateUpdate(userId, parsed.data.chapterId, parsed.data.markdown);
    return { success: true as const, simulation, markdown: parsed.data.markdown };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Échec de l'analyse." };
  }
}

export async function commitUpdateAction(
  chapterId: string,
  markdown: string,
  acknowledgedAnomalyKeys: string[],
) {
  const userId = await requireUserId();
  await chapter.commitUpdate(userId, chapterId, markdown, acknowledgedAnomalyKeys);
  revalidatePath(`/curriculum/chapitre/${chapterId}`);
  revalidatePath("/curriculum");
  redirect(`/curriculum/chapitre/${chapterId}`);
}

// Adaptateurs minces S1.archive/unarchive/deleteChapter (Bloc 9.1, USER_FLOW É6.1/É6.4).

export async function archiveChapterAction(chapterId: string) {
  const userId = await requireUserId();
  await chapter.archiveChapter(userId, chapterId);
  revalidatePath(`/curriculum/chapitre/${chapterId}`);
  revalidatePath("/curriculum");
}

export async function unarchiveChapterAction(chapterId: string) {
  const userId = await requireUserId();
  await chapter.unarchiveChapter(userId, chapterId);
  revalidatePath(`/curriculum/chapitre/${chapterId}`);
  revalidatePath("/curriculum");
}

export async function deleteChapterAction(chapterId: string) {
  const userId = await requireUserId();
  await chapter.deleteChapter(userId, chapterId);
  revalidatePath("/curriculum");
  redirect("/curriculum");
}

// Adaptateur mince S3.generateBatch (USER_FLOW É6.1 « [Générer les rubriques en
// lot] », FUNCTIONS §3) — jamais bloquant (règle transversale 1) : generateBatch
// isole chaque échec par section (Promise.allSettled), une section en échec
// reste `rubrique_a_valider`, rédigeable à la main depuis son propre écran
// (voie de secours déjà construite, É1.5).
export async function generateBatchAction(chapterId: string) {
  const userId = await requireUserId();
  const results = await guide.generateBatch(userId, chapterId);
  revalidatePath(`/curriculum/chapitre/${chapterId}`);
  return { total: results.length, echecs: results.filter((r) => !r.ok).length };
}
