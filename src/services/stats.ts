import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  studySession,
  studyCycle,
  serieGel,
  deadline,
  deferralLog,
  refileItem,
  reviewCard,
  section,
  chapter,
  subject,
  plannerConfig,
} from "@/db/schema";
import * as account from "./account";
import { computeStreak, type StreakResult } from "@/core/planner/computeStreak";

// S11 · StatsService (IMPLEMENT_SCHEDULE.md §4) — logique dérivée de l'écran
// Régularité : rien n'est stocké en plus, tout se recalcule à la lecture depuis
// study_session/serie_gel/deferral_log/refile_item/review_card. Possède aussi
// l'écriture du gel de série (mutation adjacente au calcul qu'elle protège).

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// Jours distincts avec >= 1 session terminée — tout l'historique (la meilleure
// série en a besoin, §4).
async function allSessionDates(userId: string): Promise<string[]> {
  const rows = await db
    .select({ jour: sql<string>`(${studySession.createdAt})::date` })
    .from(studySession)
    .innerJoin(studyCycle, eq(studySession.cycleId, studyCycle.id))
    .where(eq(studyCycle.userId, userId))
    .groupBy(sql`(${studySession.createdAt})::date`);
  return rows.map((r) => r.jour);
}

async function allGelDates(): Promise<string[]> {
  const rows = await db.query.serieGel.findMany({ columns: { date: true } });
  return rows.map((r) => r.date);
}

export async function streak(userId: string, today: string = todayIso()): Promise<StreakResult> {
  const [sessionDates, gelDates] = await Promise.all([allSessionDates(userId), allGelDates()]);
  return computeStreak({ today, sessionDates, gelDates });
}

// Sessions par jour dans [from, to] — heatmap (§4, §7 ActivityHeatmap).
export async function sessionCountsByDay(
  userId: string,
  from: string,
  to: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({ jour: sql<string>`(${studySession.createdAt})::date`, n: sql<number>`count(*)::int` })
    .from(studySession)
    .innerJoin(studyCycle, eq(studySession.cycleId, studyCycle.id))
    .where(
      and(
        eq(studyCycle.userId, userId),
        gte(sql`(${studySession.createdAt})::date`, from),
        lte(sql`(${studySession.createdAt})::date`, to),
      ),
    )
    .groupBy(sql`(${studySession.createdAt})::date`);
  return Object.fromEntries(rows.map((r) => [r.jour, r.n]));
}

// Instantané pour ActivityHeatmap (§4) : sessions/jour, jours gelés, jours avec
// une échéance non-"autre" — surcouches visuelles, aucun calcul de rendu ici.
export async function heatmapData(userId: string, from: string, to: string) {
  const [sessionCounts, gelRows, deadlineRows] = await Promise.all([
    sessionCountsByDay(userId, from, to),
    db.query.serieGel.findMany({
      where: and(gte(serieGel.date, from), lte(serieGel.date, to)),
      columns: { date: true },
    }),
    db.query.deadline.findMany({
      where: and(gte(deadline.dueDate, from), lte(deadline.dueDate, to)),
      columns: { dueDate: true, type: true },
    }),
  ]);
  return {
    sessionCounts,
    gelDates: gelRows.map((r) => r.date),
    deadlineDates: [...new Set(deadlineRows.filter((d) => d.type !== "autre").map((d) => d.dueDate))],
  };
}

// Dette de reports (§4) : items reportés (pas d'avance) encore présents dans la
// re-file à une date <= aujourd'hui — mono-utilisateur, DeferralLog/RefileItem
// n'ont pas de userId (même doctrine que S5, réutilisée telle quelle, pas dupliquée).
export async function detteReports(date: string = todayIso()): Promise<number> {
  const rows = await db
    .selectDistinct({ itemId: deferralLog.itemId })
    .from(deferralLog)
    .innerJoin(refileItem, and(eq(refileItem.itemId, deferralLog.itemId), lte(refileItem.date, date)))
    .where(eq(deferralLog.avance, false));
  return rows.length;
}

// Charge par jour sur [today-1, today+14] (§4 : `count(review_card WHERE due =
// jour AND gelee = false) + nouvellesParJour` — le backlog de nouvelles études
// est supposé plein chaque jour, même simplification que P8/computeHorizon qui
// ne modélise pas le backlog d'études faute de dates). today-1 inclus : le
// moteur d'alertes a besoin de J-1 pour les échéances à J+0 (§5 pic_charge).
export async function chargeParJour(
  userId: string,
  date: string = todayIso(),
): Promise<Record<string, number>> {
  const config = await account.getPlannerConfig(userId);
  const from = addDays(date, -1);
  const to = addDays(date, 14);

  const rows = await db
    .select({ jour: reviewCard.due, n: sql<number>`count(*)::int` })
    .from(reviewCard)
    .innerJoin(section, eq(reviewCard.sectionId, section.id))
    .innerJoin(chapter, eq(section.chapterId, chapter.id))
    .innerJoin(subject, eq(chapter.subjectId, subject.id))
    .where(
      and(
        eq(subject.userId, userId),
        eq(subject.statut, "active"),
        eq(chapter.statut, "actif"),
        eq(reviewCard.gelee, false),
        gte(reviewCard.due, from),
        lte(reviewCard.due, to),
      ),
    )
    .groupBy(reviewCard.due);
  const parJour = new Map(rows.map((r) => [r.jour, r.n]));

  const result: Record<string, number> = {};
  for (let d = from; d <= to; d = addDays(d, 1)) {
    result[d] = (parJour.get(d) ?? 0) + config.nouvellesParJour;
  }
  return result;
}

// Moyenne 14 j [today, today+13] (§5 pic_charge : « moyenne de la charge sur 14 j »).
export function averageCharge14j(charge: Record<string, number>, today: string): number {
  let sum = 0;
  for (let i = 0; i < 14; i++) sum += charge[addDays(today, i)] ?? 0;
  return sum / 14;
}

// « Utiliser un gel » (§6 toast actionnable serie_en_peril) : protège le jour,
// décrémente le compteur — refusé si aucun gel restant (§8 critère 6).
export async function useStreakFreeze(userId: string, date: string = todayIso()): Promise<void> {
  const config = await account.getPlannerConfig(userId);
  if (config.gelsSerieRestants <= 0) throw new Error("Aucun gel de série restant.");

  await db.insert(serieGel).values({ date }).onConflictDoNothing();
  await db
    .update(plannerConfig)
    .set({ gelsSerieRestants: config.gelsSerieRestants - 1 })
    .where(eq(plannerConfig.userId, userId));
}
