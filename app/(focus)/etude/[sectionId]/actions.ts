"use server";

import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import * as session from "@/services/session";

// Bloc 5.2 (É3.1–É3.2) + Bloc 5.3 (Règle de commit) : adaptateurs minces vers
// S4.SessionService — un point d'entrée par action, aucune logique métier ici
// (AGENTS §2).

// Champ caché `rejectedIndexes` sérialisé par CorrectionView — parsing pur,
// pas de règle métier (celle-ci vit dans S7.commitCandidates).
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

export async function submitBlurtingAction(
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
  redirect(`/etude/${sectionId}`);
}

// USER_FLOW É3.2, erreur LLM : le blurting est déjà sauvegardé, on relance
// uniquement la correction, sans re-saisie. Formulaire simple (pas de
// useActionState possible dans la page, Server Component) : un nouvel échec
// remonte à app/(focus)/error.tsx (mécanisme natif, ARCHITECTURE §10) plutôt
// que d'être avalé ici.
export async function retryCorrectionAction(cycleId: string, sectionId: string) {
  const userId = await requireUserId();
  await session.retryCorrection(userId, cycleId);
  redirect(`/etude/${sectionId}`);
}

export async function retenterAction(cycleId: string, formData: FormData) {
  const userId = await requireUserId();
  await session.resolveOutcome(userId, cycleId, "retenter", parseRejectedIndexes(formData));
  redirect("/");
}

// Pas de redirection : la vue révélée est affichée inline par CorrectionView
// (le cycle a déjà bouclé vers `blurting` côté serveur, une relecture arriverait
// trop tard — cf. session.resolveOutcome).
export async function revelerAction(cycleId: string, _prevState: unknown, formData: FormData) {
  const userId = await requireUserId();
  return session.resolveOutcome(userId, cycleId, "reveler", parseRejectedIndexes(formData));
}

export async function abandonAction(cycleId: string) {
  const userId = await requireUserId();
  await session.abandon(userId, cycleId);
  redirect("/");
}

// Raccourci temporaire (session.ts, DECISIONS.md bloc 5.1) : remplacé par
// validateSection en Phase 6.
export async function terminerAction(cycleId: string, formData: FormData) {
  const userId = await requireUserId();
  await session.terminerSessionTemporaire(userId, cycleId, parseRejectedIndexes(formData));
  redirect("/");
}
