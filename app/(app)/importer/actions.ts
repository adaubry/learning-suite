"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth";
import * as ficheService from "@/services/fiche";
import { importInputSchema, reimportInputSchema } from "@/services/fiche.schemas";

// Adaptateurs minces vers FicheService (auth → zod → un service → retour).

export async function previewImportAction(_prevState: unknown, formData: FormData) {
  const markdown = String(formData.get("markdown") ?? "");
  const setId = String(formData.get("setId") ?? "") || undefined;
  if (!markdown.trim()) return { error: "Le document est vide." };
  const userId = await requireUserId();
  try {
    return { apercu: await ficheService.previewImport(userId, markdown, setId) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Analyse impossible." };
  }
}

export async function importSetAction(_prevState: unknown, formData: FormData) {
  const parsed = importInputSchema.safeParse({
    subjectId: formData.get("subjectId"),
    titre: formData.get("titre"),
    markdown: formData.get("markdown"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const userId = await requireUserId();
  try {
    await ficheService.importSet(userId, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import impossible." };
  }
  revalidatePath("/curriculum");
  redirect("/curriculum");
}

export async function reimportSetAction(_prevState: unknown, formData: FormData) {
  const parsed = reimportInputSchema.safeParse({ setId: formData.get("setId"), markdown: formData.get("markdown") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const userId = await requireUserId();
  try {
    await ficheService.reimportSet(userId, parsed.data.setId, parsed.data.markdown);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ré-import impossible." };
  }
  revalidatePath("/curriculum");
  redirect("/curriculum");
}
