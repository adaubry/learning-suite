"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth";
import * as guide from "@/services/guide";

// Bloc 4.2 (É1.5) : adaptateurs minces vers S3.GuideService — un point d'entrée
// par action, aucune logique métier ici (AGENTS §2).

export async function validateRubricAction(
  guideId: string,
  _prevState: unknown,
  formData: FormData,
) {
  const userId = await requireUserId();
  let points: unknown;
  try {
    points = JSON.parse(String(formData.get("points") ?? "[]"));
  } catch {
    return { error: "Points illisibles." };
  }

  try {
    await guide.validate(userId, guideId, points);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de la validation." };
  }
  revalidatePath("/curriculum");
  redirect("/curriculum");
}

// Erreur LLM honnête + [Relancer] (USER_FLOW É1.5, règle transversale 7) : la
// régénération ne doit jamais faire planter l'écran (la rédaction manuelle
// reste la voie de secours affichée juste en dessous, RubricEditor).
export async function regenerateRubricAction(sectionId: string) {
  const userId = await requireUserId();
  try {
    await guide.regenerate(userId, sectionId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de la régénération." };
  }
  revalidatePath(`/section/${sectionId}/rubrique`);
}
