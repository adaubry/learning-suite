"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import * as session from "@/services/session";

// Bloc 5.2 (É3.1–É3.2) + Bloc 5.3 (Règle de commit) + Bloc 7.1 (transcribeAction) :
// adaptateurs minces vers S4.SessionService — un point d'entrée par action,
// aucune logique métier ici (AGENTS §2).

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

export async function terminerAction(cycleId: string, formData: FormData) {
  const userId = await requireUserId();
  await session.validateSection(userId, cycleId, parseRejectedIndexes(formData));
  redirect("/");
}

// USER_FLOW É3.2 [Passer au Feynman] / [Passer au Feynman quand même] (override
// journalisé sur verdict insuffisant) — transition seule (S4.beginFeynman) ;
// le tour d'ouverture streame séparément une fois sur /etude (U19 appelle la
// route /api/feynman/turn en mode "opening", Bloc 7.2).
export async function passerFeynmanAction(cycleId: string, sectionId: string, formData: FormData) {
  const userId = await requireUserId();
  const override = formData.get("override") === "true";
  await session.beginFeynman(userId, cycleId, parseRejectedIndexes(formData), override);
  redirect(`/etude/${sectionId}`);
}

// USER_FLOW É3.4 [Valider la section] depuis le bilan — `override` : confirmation
// explicite sur bilan insuffisant (journalisé par S4, validation_sur_insuffisant).
export async function validerBilanAction(cycleId: string, formData: FormData) {
  const userId = await requireUserId();
  const override = formData.get("override") === "true";
  await session.validateSection(userId, cycleId, [], override);
  redirect("/");
}

// USER_FLOW É3.4 [Revenir au blurting] → re-file intra-journée.
export async function revenirBlurtingAction(cycleId: string) {
  const userId = await requireUserId();
  await session.returnToBlurting(userId, cycleId);
  redirect("/");
}

// USER_FLOW É3.3 [Clore et demander le bilan] — pas de streaming (L5 renvoie un
// JSON structuré unique, pas un texte libre) : Server Action classique, la page
// se re-rend en U21 une fois `cycle.etat === "bilan"`.
export async function closeFeynmanAction(cycleId: string, sectionId: string) {
  const userId = await requireUserId();
  await session.closeFeynman(userId, cycleId);
  redirect(`/etude/${sectionId}`);
}

// USER_FLOW É3.4 [Refaire un Feynman] → transition seule (S4.beginRestartFeynman) ;
// le tour d'ouverture streame séparément une fois de retour sur /etude (U19
// rappelle /api/feynman/turn en mode "opening", qui relit l'historique déjà
// connu — même route que la toute première ouverture, PLAN Bloc 7.2).
export async function refaireFeynmanAction(cycleId: string, sectionId: string) {
  const userId = await requireUserId();
  await session.beginRestartFeynman(userId, cycleId);
  redirect(`/etude/${sectionId}`);
}

const transcribeInputSchema = z.object({
  cycleId: z.string().min(1),
  audioBase64: z.string().min(1),
  audioFormat: z.string().min(1).max(10),
});

// U20 (PushToTalkRecorder, Bloc 7.1) : pas de redirection — le transcript est
// affiché inline dans un champ éditable avant envoi (USER_FLOW É3.3), le cycle
// n'avance pas d'état ici.
export async function transcribeAction(cycleId: string, audioBase64: string, audioFormat: string) {
  const parsed = transcribeInputSchema.safeParse({ cycleId, audioBase64, audioFormat });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const userId = await requireUserId();
  try {
    const transcript = await session.transcribe(
      userId,
      parsed.data.cycleId,
      parsed.data.audioBase64,
      parsed.data.audioFormat,
    );
    return { transcript };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de la transcription." };
  }
}
