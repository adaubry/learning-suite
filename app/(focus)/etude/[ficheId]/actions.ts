"use server";

import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import * as session from "@/services/session";
import * as errorService from "@/services/error";
import { addErrorInputSchema } from "@/services/error.schemas";
import type { Note } from "@/core/fsrs/fsrsCore";

// Adaptateurs minces vers SessionService — un point d'entrée par action, aucune
// logique métier ici (AGENTS §2).

// Champ caché `coches` sérialisé par ComparaisonView — parsing seul.
function parseCoches(formData: FormData): number[] {
  const raw = formData.get("coches");
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

export async function terminerLectureAction(cycleId: string, ficheId: string) {
  const userId = await requireUserId();
  await session.terminerLecture(userId, cycleId);
  redirect(`/etude/${ficheId}`);
}

export async function submitBlurtingAction(cycleId: string, ficheId: string, _prevState: unknown, formData: FormData) {
  const userId = await requireUserId();
  const blurting = String(formData.get("blurting") ?? "").trim();
  if (!blurting) return { error: "La restitution ne peut pas être vide." };

  try {
    await session.submitBlurting(userId, cycleId, blurting);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur à l'enregistrement." };
  }
  redirect(`/etude/${ficheId}`);
}

export async function relireAction(cycleId: string, ficheId: string, formData: FormData) {
  const userId = await requireUserId();
  await session.relire(userId, cycleId, parseCoches(formData));
  redirect(`/etude/${ficheId}`);
}

export async function noterAction(cycleId: string, note: Note, formData: FormData) {
  const userId = await requireUserId();
  await session.noter(userId, cycleId, note, parseCoches(formData));
  redirect("/");
}

export async function abandonAction(cycleId: string) {
  const userId = await requireUserId();
  await session.abandon(userId, cycleId);
  redirect("/");
}

export async function addErrorAction(_prevState: unknown, formData: FormData) {
  const parsed = addErrorInputSchema.safeParse({
    tentativeId: formData.get("tentativeId"),
    type: formData.get("type"),
    description: formData.get("description"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const userId = await requireUserId();
  const { tentativeId, ...input } = parsed.data;
  await errorService.addManual(userId, tentativeId, input);
  return { ok: true as const };
}
