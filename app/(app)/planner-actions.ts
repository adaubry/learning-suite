"use server";

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

export async function reorderAction(index: number, direction: "up" | "down", formData: FormData) {
  await requireUserId();
  const raw = formData.get("keys");
  if (typeof raw !== "string") return;
  const keys = JSON.parse(raw) as string[];
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= keys.length) return;
  [keys[index], keys[target]] = [keys[target], keys[index]];
  await planner.reorder(keys);
  revalidatePath("/");
}
