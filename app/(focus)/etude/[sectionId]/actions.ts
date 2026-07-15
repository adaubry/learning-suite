"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import * as session from "@/services/session";
import type { Note } from "@/core/fsrs/fsrsCore";

// Bloc 5.2 (É3.1–É3.2) + Bloc 5.3 (Règle de commit) + Bloc 7.1 (transcribeAction)
// + REVAMP v2 (2026-07-15, lecture/2-passes/Feynman obligatoire) : adaptateurs
// minces vers S4.SessionService — un point d'entrée par action, aucune logique
// métier ici (AGENTS §2).

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

// USER_FLOW É3.1 [Je suis prêt, je blurte] — transition seule lecture→blurting
// (lecture initiale ET relecture ciblée partagent ce même point d'entrée).
export async function terminerLectureAction(cycleId: string, sectionId: string) {
  const userId = await requireUserId();
  await session.terminerLecture(userId, cycleId);
  redirect(`/etude/${sectionId}`);
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

// USER_FLOW É3.3, erreur LLM : le blurting est déjà sauvegardé, on relance
// uniquement la correction, sans re-saisie. Formulaire simple (pas de
// useActionState possible dans la page, Server Component) : un nouvel échec
// remonte à app/(focus)/error.tsx (mécanisme natif, ARCHITECTURE §10) plutôt
// que d'être avalé ici.
export async function retryCorrectionAction(cycleId: string, sectionId: string) {
  const userId = await requireUserId();
  await session.retryCorrection(userId, cycleId);
  redirect(`/etude/${sectionId}`);
}

// USER_FLOW É3.3 [Relire, puis refaire un blurting] — n'est acceptée qu'à la
// 1ʳᵉ tentative (S4.resolveOutcome le garantit) ; boucle vers lecture_2
// (relecture ciblée), immédiatement, dans la même séance (rupture B, REVAMP v2).
export async function relireAction(cycleId: string, sectionId: string, formData: FormData) {
  const userId = await requireUserId();
  await session.resolveOutcome(userId, cycleId, parseRejectedIndexes(formData));
  redirect(`/etude/${sectionId}`);
}

// [Abandonner] : disponible en lecture, blurting ET correction (USER_FLOW
// É3.1/É3.2/É3.3) — ferme le cycle proprement (S4.abandon, réutilisée telle
// quelle, cf. §2.3bis REVAMP.md/DECISIONS.md).
export async function abandonAction(cycleId: string) {
  const userId = await requireUserId();
  await session.abandon(userId, cycleId);
  redirect("/");
}

// USER_FLOW É3.3 [Passer au Feynman] — toujours disponible, quel que soit le
// verdict (rupture C, REVAMP v2 : plus d'override, plus de confirmation).
export async function passerFeynmanAction(cycleId: string, sectionId: string, formData: FormData) {
  const userId = await requireUserId();
  await session.beginFeynman(userId, cycleId, parseRejectedIndexes(formData));
  redirect(`/etude/${sectionId}`);
}

// USER_FLOW É3.5 — bilan : l'auto-note FSRS (Again/Hard/Good/Easy) est la
// condition de clôture (fusion Machine B/C, 2026-07-15) ; `override` est
// précalculé côté page (bilan.verdict !== "acquis") et lié via .bind, le choix
// de la note EST la confirmation explicite (journalisée par S4 si insuffisant).
export async function validerBilanAction(cycleId: string, override: boolean, note: Note) {
  const userId = await requireUserId();
  await session.validateSection(userId, cycleId, note, override);
  redirect("/");
}

// USER_FLOW É3.5 [Revenir au blurting] → re-file intra-journée.
export async function revenirBlurtingAction(cycleId: string) {
  const userId = await requireUserId();
  await session.returnToBlurting(userId, cycleId);
  redirect("/");
}

// USER_FLOW É3.4 [Clore et demander le bilan] — pas de streaming (L5 renvoie un
// JSON structuré unique, pas un texte libre) : Server Action classique, la page
// se re-rend en U21 une fois `cycle.etat === "bilan"`.
export async function closeFeynmanAction(cycleId: string, sectionId: string) {
  const userId = await requireUserId();
  await session.closeFeynman(userId, cycleId);
  redirect(`/etude/${sectionId}`);
}

// USER_FLOW É3.5 [Refaire un Feynman] → transition seule (S4.beginRestartFeynman) ;
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
// affiché inline dans un champ éditable avant envoi (USER_FLOW É3.4), le cycle
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
