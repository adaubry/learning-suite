"use server";

import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import * as session from "@/services/session";
import type { Note } from "@/core/fsrs/fsrsCore";

// Bloc 6.4 (É4.1–É4.2) : adaptateurs minces vers S4.SessionService — même
// gabarit que app/(focus)/etude/[sectionId]/actions.ts (AGENTS §2).

function parseRejectedIndexes(formData: FormData): number[] {
  const raw = formData.get("rejectedIndexes");
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function submitRevisionAction(
  cycleId: string,
  sectionId: string,
  _prevState: unknown,
  formData: FormData,
) {
  const userId = await requireUserId();
  const blurting = String(formData.get("blurting") ?? "").trim();
  if (!blurting) return { error: "La restitution ne peut pas être vide." };

  try {
    await session.submitBlurting(userId, cycleId, blurting);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de la correction." };
  }
  redirect(`/revision/${sectionId}`);
}

export async function retryCorrectionAction(cycleId: string, sectionId: string) {
  const userId = await requireUserId();
  await session.retryCorrection(userId, cycleId);
  redirect(`/revision/${sectionId}`);
}

// Pas de retenter/révéler en révision (divulgation déjà complète d'emblée,
// ARCHITECTURE §6) : la seule issue est la note FSRS.
export async function rateRevisionAction(cycleId: string, note: Note, formData: FormData) {
  const userId = await requireUserId();
  await session.rateRevision(userId, cycleId, note, parseRejectedIndexes(formData));
  redirect("/");
}

export async function abandonAction(cycleId: string) {
  const userId = await requireUserId();
  await session.abandon(userId, cycleId);
  redirect("/");
}
