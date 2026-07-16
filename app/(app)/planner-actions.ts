"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth";
import * as planner from "@/services/planner";

// S5.defer/reorder (FUNCTIONS §4) : adaptateurs minces — un point d'entrée par
// action, aucune logique métier ici (AGENTS §2).

export async function deferAction(itemType: "etude" | "revision", itemId: string) {
  await requireUserId();
  await planner.defer(itemType, itemId);
  revalidatePath("/");
}

export async function reorderAction(index: number, direction: "up" | "down" | "top", formData: FormData) {
  await requireUserId();
  const raw = formData.get("keys");
  if (typeof raw !== "string") return;
  const keys = JSON.parse(raw) as string[];
  if (direction === "top") {
    if (index <= 0 || index >= keys.length) return;
    const [item] = keys.splice(index, 1);
    keys.unshift(item);
  } else {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= keys.length) return;
    [keys[index], keys[target]] = [keys[target], keys[index]];
  }
  await planner.reorder(keys);
  revalidatePath("/");
}

// État vide É2.0 (USER_FLOW) : avance une candidate du backlog en empruntant un
// slot de demain, puis démarre l'étude tout de suite (S4.start, via la page focus
// — même chemin qu'un clic [Commencer] normal).
export async function advanceFromBacklogAction(sectionId: string) {
  await requireUserId();
  await planner.advanceFromBacklog(sectionId);
  redirect(`/etude/${sectionId}`);
}
