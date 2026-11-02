"use server";

import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import * as session from "@/services/session";
import type { Note } from "@/core/fsrs/fsrsCore";

// Adaptateurs minces vers SessionService — un point d'entrée par action, aucune
// logique métier ici (AGENTS §2).

// Champ caché `rejectedIndexes` sérialisé par CorrectionView — parsing seul.
function parseRejectedIndexes(formData: FormData): number[] {
  const raw = formData.get("rejectedIndexes");
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
    // La tentative est déjà sauvegardée : la page affichera [Relancer la correction].
    if (!(e instanceof session.WrongCycleStateError)) redirect(`/etude/${ficheId}`);
    return { error: e instanceof Error ? e.message : "Erreur lors de la correction." };
  }
  redirect(`/etude/${ficheId}`);
}

// Un nouvel échec remonte à app/(focus)/error.tsx plutôt que d'être avalé ici.
export async function retryCorrectionAction(cycleId: string, ficheId: string) {
  const userId = await requireUserId();
  await session.retryCorrection(userId, cycleId);
  redirect(`/etude/${ficheId}`);
}

export async function relireAction(cycleId: string, ficheId: string, formData: FormData) {
  const userId = await requireUserId();
  await session.relire(userId, cycleId, parseRejectedIndexes(formData));
  redirect(`/etude/${ficheId}`);
}

export async function noterAction(cycleId: string, note: Note, formData: FormData) {
  const userId = await requireUserId();
  await session.noter(userId, cycleId, note, parseRejectedIndexes(formData));
  redirect("/");
}

export async function abandonAction(cycleId: string) {
  const userId = await requireUserId();
  await session.abandon(userId, cycleId);
  redirect("/");
}
