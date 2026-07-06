"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import * as chapter from "@/services/chapter";
import { chapterAnalyzeInputSchema, chapterImportInputSchema } from "@/services/chapter.schemas";

// Adaptateurs minces S1.import (FUNCTIONS §4) — U23 ImportWizard, étapes É1.1/É1.2.

async function requireUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

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
  try {
    await chapter.importChapter(userId, parsed.data);
  } catch (err) {
    if (err instanceof chapter.AnomaliesNonAcquitteesError) {
      return { error: err.message };
    }
    throw err;
  }
  revalidatePath("/curriculum");
  redirect("/curriculum");
}
