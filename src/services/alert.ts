import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { alert as alertTable } from "@/db/schema";
import * as account from "./account";
import * as deadlineService from "./deadline";
import * as statsService from "./stats";
import { evaluateAlertRules } from "@/core/planner/generateAlerts";

// S12 · AlertService (IMPLEMENT_SCHEDULE.md §5, §6) — mono-utilisateur (ADR 6),
// pas de userId sur `alert`. `generateAlerts` est LE point d'entrée idempotent
// (ON CONFLICT DO NOTHING sur l'index `alert_dedupe`, jamais de DELETE/UPDATE
// de son cru) ; le reste gère le cycle de vie (visibles, dismiss, snooze) et le
// cas client-évalué `serie_en_peril`.

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// Appelée (a) à chaque chargement de l'app, (b) par un cron si l'infra en a un
// — mono-utilisateur, (a) suffit en pratique (§5). N'insère jamais deux fois la
// même alerte le même jour (index unique), ne supprime ni ne modifie rien.
export async function generateAlerts(userId: string, today: string = todayIso()): Promise<void> {
  const [deadlines, detteReports, config, charge] = await Promise.all([
    deadlineService.list(),
    statsService.detteReports(today),
    account.getPlannerConfig(userId),
    statsService.chargeParJour(userId, today),
  ]);

  const candidates = evaluateAlertRules({
    today,
    deadlines: deadlines.map((d) => ({
      id: d.id,
      type: d.type,
      dueDate: d.dueDate,
      coefficient: d.coefficient,
      libelle: d.libelle,
    })),
    detteReports,
    seuilDetteReports: config.seuilDetteReports,
    chargeParJour: charge,
    moyenneCharge14j: statsService.averageCharge14j(charge, today),
  });

  if (candidates.length === 0) return;
  await db.insert(alertTable).values(candidates).onConflictDoNothing();
}

// serie_en_peril (§5) : seule règle évaluée côté client (timer sur heureAlerteSerie
// + série >= 3) — insérée à l'affichage, même garantie d'idempotence que le reste.
export async function recordSerieEnPeril(today: string = todayIso()): Promise<void> {
  await db
    .insert(alertTable)
    .values({ type: "serie_en_peril", deadlineId: null, dateRef: today, payload: {} })
    .onConflictDoNothing();
}

// Visibles (§5) : ni dismissée, ni snoozée au-delà d'aujourd'hui.
export async function listVisible(today: string = todayIso()) {
  return db.query.alert.findMany({
    where: and(isNull(alertTable.dismissedAt), or(isNull(alertTable.snoozedUntil), lte(alertTable.snoozedUntil, today))),
    orderBy: (a, { desc }) => [desc(a.createdAt)],
  });
}

// Centre d'alertes (§5) : visibles + historique 30 j (cloche).
export async function listHistory(days = 30, today: string = todayIso()) {
  return db.query.alert.findMany({
    where: gte(alertTable.dateRef, addDays(today, -days)),
    orderBy: (a, { desc }) => [desc(a.createdAt)],
  });
}

export async function dismiss(id: string): Promise<void> {
  await db.update(alertTable).set({ dismissedAt: new Date() }).where(eq(alertTable.id, id));
}

// jour_j et depassee non snoozables (§6) — renforcé ici, pas seulement omis côté UI.
export async function snooze(id: string, untilDate: string): Promise<void> {
  const row = await db.query.alert.findFirst({ where: eq(alertTable.id, id) });
  if (!row) return;
  if (row.type === "echeance_jour_j" || row.type === "echeance_depassee") {
    throw new Error("Cette alerte n'est pas reportable.");
  }
  await db.update(alertTable).set({ snoozedUntil: untilDate }).where(eq(alertTable.id, id));
}

// Cascade d'acquittement (§5 : « Cocher une deadline dismisse automatiquement
// toutes ses alertes »), appelée par DeadlineService.ack — jamais directement
// depuis une Server Action.
export async function dismissForDeadline(deadlineId: string): Promise<void> {
  await db
    .update(alertTable)
    .set({ dismissedAt: new Date() })
    .where(and(eq(alertTable.deadlineId, deadlineId), isNull(alertTable.dismissedAt)));
}

// ponytail: restaure les alertes dismissées AUJOURD'HUI pour cette deadline (la
// fenêtre réelle d'un undo de toast, 5s) — pas tout l'historique de dismissals,
// qui peut inclure des fermetures manuelles antérieures légitimes.
export async function restoreTodayDismissedForDeadline(
  deadlineId: string,
  today: string = todayIso(),
): Promise<void> {
  await db
    .update(alertTable)
    .set({ dismissedAt: null })
    .where(and(eq(alertTable.deadlineId, deadlineId), eq(alertTable.dateRef, today)));
}
