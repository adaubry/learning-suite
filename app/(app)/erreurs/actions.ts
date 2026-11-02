"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth";
import * as errorService from "@/services/error";

// Adaptateurs minces vers ErrorService — aucune logique métier ici (AGENTS §2).

export async function resolveErrorAction(errorId: string) {
  const userId = await requireUserId();
  await errorService.resolve(userId, errorId);
  revalidatePath("/erreurs");
}

export async function reopenErrorAction(errorId: string) {
  const userId = await requireUserId();
  await errorService.reopen(userId, errorId);
  revalidatePath("/erreurs");
}

export async function editErrorAction(errorId: string, formData: FormData) {
  const userId = await requireUserId();
  const description = String(formData.get("description") ?? "").trim();
  if (!description) return;
  await errorService.edit(userId, errorId, { description });
  revalidatePath("/erreurs");
}

export async function deleteErrorAction(errorId: string) {
  const userId = await requireUserId();
  await errorService.deleteEntry(userId, errorId);
  revalidatePath("/erreurs");
}
