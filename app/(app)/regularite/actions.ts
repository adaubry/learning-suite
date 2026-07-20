"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth";
import * as deadlineService from "@/services/deadline";
import * as alertService from "@/services/alert";
import * as statsService from "@/services/stats";
import * as accountService from "@/services/account";
import { deadlineInputSchema, deadlineUpdateInputSchema, type DeadlineInput, type DeadlineUpdateInput } from "@/services/deadline.schemas";

// Adaptateurs minces S10/S11/S12 (FUNCTIONS §4) — écran Régularité + AlertBanner
// global (rendu par le layout (app)/, d'où la revalidation de tout le shell).
// Arguments typés directement (pas de FormData) : les champs du formulaire
// (DateInput/Selector/NumberInput Astryx) sont des composants contrôlés, sans
// name HTML garanti — même doctrine que les actions ack/dismiss/snooze ci-dessous.

function revalidateAll() {
  revalidatePath("/", "layout");
}

export async function createDeadlineAction(input: DeadlineInput) {
  const parsed = deadlineInputSchema.parse(input);
  await requireUserId();
  await deadlineService.create(parsed);
  revalidateAll();
}

export async function updateDeadlineAction(input: DeadlineUpdateInput) {
  const parsed = deadlineUpdateInputSchema.parse(input);
  await requireUserId();
  await deadlineService.update(parsed);
  revalidateAll();
}

export async function ackDeadlineAction(id: string) {
  await requireUserId();
  await deadlineService.ack(id);
  revalidateAll();
}

export async function unackDeadlineAction(id: string) {
  await requireUserId();
  await deadlineService.unack(id);
  revalidateAll();
}

export async function removeDeadlineAction(id: string, scope: "this" | "following") {
  await requireUserId();
  await deadlineService.remove(id, scope);
  revalidateAll();
}

export async function dismissAlertAction(id: string) {
  await requireUserId();
  await alertService.dismiss(id);
  revalidateAll();
}

export async function snoozeAlertAction(id: string) {
  await requireUserId();
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  await alertService.snooze(id, tomorrow.toISOString().slice(0, 10));
  revalidateAll();
}

export async function freezeStreakAction() {
  const userId = await requireUserId();
  await statsService.useStreakFreeze(userId);
  revalidateAll();
}

// serie_en_peril (§5) : seule règle évaluée côté client (timer) — insérée à
// l'affichage plutôt que par generateAlerts.
export async function recordSerieEnPerilAction() {
  await requireUserId();
  await alertService.recordSerieEnPeril();
  revalidateAll();
}

export async function updateSemesterConfigAction(input: { debutS3: string | null; debutS4: string | null }) {
  const userId = await requireUserId();
  await accountService.updateSemesterConfig(userId, input);
  revalidateAll();
}
