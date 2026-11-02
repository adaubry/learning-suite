"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth";
import * as account from "@/services/account";
import * as ficheService from "@/services/fiche";
import { subjectInputSchema, plannerConfigInputSchema } from "@/services/account.schemas";

// Adaptateurs minces (auth → zod → un service → retour) pour les matières, les
// sets de fiches et les réglages — aucune logique métier ici (AGENTS §2).

export async function createSubjectAction(_prevState: unknown, formData: FormData) {
  const parsed = subjectInputSchema.safeParse({
    nom: formData.get("nom"),
    semestre: formData.get("semestre"),
    dateExamen: formData.get("dateExamen"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const userId = await requireUserId();
  const created = await account.createSubject(userId, parsed.data);
  revalidatePath("/curriculum");
  revalidatePath("/importer");
  return { success: true as const, subjectId: created.id };
}

export async function updateSubjectAction(_prevState: unknown, formData: FormData) {
  const subjectId = formData.get("subjectId");
  if (typeof subjectId !== "string" || !subjectId) return { error: "Matière introuvable." };
  const parsed = subjectInputSchema.safeParse({
    nom: formData.get("nom"),
    semestre: formData.get("semestre"),
    dateExamen: formData.get("dateExamen"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const userId = await requireUserId();
  await account.updateSubject(userId, subjectId, { ...parsed.data, dateExamen: parsed.data.dateExamen ?? null });
  revalidatePath("/curriculum");
  return { success: true as const };
}

export async function archiveSubjectAction(subjectId: string) {
  const userId = await requireUserId();
  await account.archiveSubject(userId, subjectId);
  revalidatePath("/curriculum");
}

export async function unarchiveSubjectAction(subjectId: string) {
  const userId = await requireUserId();
  await account.unarchiveSubject(userId, subjectId);
  revalidatePath("/curriculum");
}

export async function deleteSubjectAction(subjectId: string) {
  const userId = await requireUserId();
  await account.deleteSubject(userId, subjectId);
  revalidatePath("/curriculum");
}

export async function archiveSetAction(setId: string) {
  const userId = await requireUserId();
  await ficheService.archiveSet(userId, setId);
  revalidatePath("/curriculum");
}

export async function unarchiveSetAction(setId: string) {
  const userId = await requireUserId();
  await ficheService.unarchiveSet(userId, setId);
  revalidatePath("/curriculum");
}

export async function deleteSetAction(setId: string) {
  const userId = await requireUserId();
  await ficheService.deleteSet(userId, setId);
  revalidatePath("/curriculum");
}

export async function updatePlannerConfigAction(_prevState: unknown, formData: FormData) {
  const parsed = plannerConfigInputSchema.safeParse({
    limiter: formData.get("limiter") ?? undefined,
    nouvellesParJour: formData.get("nouvellesParJour") ?? 3,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const userId = await requireUserId();
  await account.updatePlannerConfig(userId, parsed.data.nouvellesParJour);
  return { success: true as const };
}
