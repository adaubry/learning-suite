"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth";
import * as account from "@/services/account";
import * as guide from "@/services/guide";
import {
  subjectInputSchema,
  plannerConfigInputSchema,
  methodologieGlobaleInputSchema,
  subjectMethodologieInputSchema,
} from "@/services/account.schemas";

// Un adaptateur mince par point d'entrée S9 (FUNCTIONS §4) — réutilisé par
// l'onboarding (app/(onboarding)/) et le curriculum (app/(app)/curriculum/).

export async function createSubjectAction(_prevState: unknown, formData: FormData) {
  const parsed = subjectInputSchema.safeParse({
    nom: formData.get("nom"),
    semestre: formData.get("semestre"),
    dateExamen: formData.get("dateExamen"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const userId = await requireUserId();
  await account.createSubject(userId, parsed.data);
  revalidatePath("/curriculum");
  revalidatePath("/onboarding");
  return { success: true as const };
}

export async function updateSubjectAction(_prevState: unknown, formData: FormData) {
  const subjectId = formData.get("subjectId");
  if (typeof subjectId !== "string" || !subjectId) {
    return { error: "Matière introuvable." };
  }
  const parsedSubject = subjectInputSchema.safeParse({
    nom: formData.get("nom"),
    semestre: formData.get("semestre"),
    dateExamen: formData.get("dateExamen"),
  });
  if (!parsedSubject.success) {
    return { error: parsedSubject.error.issues[0].message };
  }
  const parsedMethodologie = subjectMethodologieInputSchema.safeParse({
    methodologieTitres: formData.get("methodologieTitres"),
  });

  const userId = await requireUserId();
  await account.updateSubject(userId, subjectId, {
    nom: parsedSubject.data.nom,
    semestre: parsedSubject.data.semestre,
    dateExamen: parsedSubject.data.dateExamen ?? null,
    methodologieTitres: parsedMethodologie.success
      ? (parsedMethodologie.data.methodologieTitres ?? null)
      : null,
  });
  revalidatePath("/curriculum");
  return { success: true as const };
}

export async function archiveSubjectAction(formData: FormData) {
  const subjectId = formData.get("subjectId");
  if (typeof subjectId !== "string" || !subjectId) return;
  const userId = await requireUserId();
  await account.archiveSubject(userId, subjectId);
  revalidatePath("/curriculum");
}

export async function unarchiveSubjectAction(formData: FormData) {
  const subjectId = formData.get("subjectId");
  if (typeof subjectId !== "string" || !subjectId) return;
  const userId = await requireUserId();
  await account.unarchiveSubject(userId, subjectId);
  revalidatePath("/curriculum");
}

export async function updatePlannerConfigAction(_prevState: unknown, formData: FormData) {
  const parsed = plannerConfigInputSchema.safeParse({
    nouvellesParJour: formData.get("nouvellesParJour"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const userId = await requireUserId();
  await account.updatePlannerConfig(userId, parsed.data.nouvellesParJour);
  return { success: true as const };
}

export async function updateMethodologieGlobaleAction(_prevState: unknown, formData: FormData) {
  const parsed = methodologieGlobaleInputSchema.safeParse({
    methodologieTitresGlobale: formData.get("methodologieTitresGlobale"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const userId = await requireUserId();
  await account.updateMethodologieGlobale(userId, parsed.data.methodologieTitresGlobale ?? null);
  return { success: true as const };
}

// Bloc 4.2 (É1.5) : déclenche la rubrique depuis le curriculum, redirige vers
// l'écran de validation U14 (S3 possède l'invariant, l'action reste un adaptateur mince).
export async function generateRubricAction(_prevState: unknown, formData: FormData) {
  const sectionId = formData.get("sectionId");
  if (typeof sectionId !== "string" || !sectionId) return { error: "Section introuvable." };
  const userId = await requireUserId();
  try {
    await guide.generate(userId, sectionId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de la génération." };
  }
  revalidatePath("/curriculum");
  redirect(`/section/${sectionId}/rubrique`);
}

export async function createManualRubricAction(_prevState: unknown, formData: FormData) {
  const sectionId = formData.get("sectionId");
  if (typeof sectionId !== "string" || !sectionId) return { error: "Section introuvable." };
  const userId = await requireUserId();
  try {
    await guide.createManual(userId, sectionId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur." };
  }
  revalidatePath("/curriculum");
  redirect(`/section/${sectionId}/rubrique`);
}

// Clôture l'onboarding (É0.2 étape 4) : garantit la ligne PlannerConfig même
// si l'étape rythme a été passée — c'est cette ligne qui marque l'onboarding fait.
export async function finishOnboardingAction(formData: FormData) {
  const userId = await requireUserId();
  const nouvellesParJour = Number(formData.get("nouvellesParJour") ?? 3);
  await account.updatePlannerConfig(userId, nouvellesParJour);
  redirect("/");
}
