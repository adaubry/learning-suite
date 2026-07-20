import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Link } from "@astryxdesign/core/Link";
import { requireUserId } from "@/lib/auth";
import * as accountService from "@/services/account";
import * as deadlineService from "@/services/deadline";
import * as statsService from "@/services/stats";
import * as alertService from "@/services/alert";
import { weekLabel } from "@/core/planner/weekLabel";
import { todayIso, addDays } from "@/lib/utils";
import { RegulariteHeader } from "@/components/regularite-header";
import { DeadlineChecklist } from "@/components/deadline-checklist";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { ChargeChart } from "@/components/charge-chart";
import { StatsPanel } from "@/components/stats-panel";

// Écran Régularité (IMPLEMENT_SCHEDULE.md §7) — U1 + U26..U31, assemblage de
// S10/S11/S12. Desktop : grille 2 colonnes. Mobile : pile verticale, gérée en
// Tailwind responsive dans les composants (DeadlineChecklist collapse,
// ChargeChart 7j/14j) plutôt que deux pages séparées.

export default async function RegularitePage() {
  const userId = await requireUserId();
  const today = todayIso();

  const [deadlines, subjects, config, streak, visibleAlerts, alertHistory, sessionsTodayMap, sessions7j] =
    await Promise.all([
      deadlineService.list(),
      accountService.listSubjects(userId),
      accountService.getPlannerConfig(userId),
      statsService.streak(userId, today),
      alertService.listVisible(today),
      alertService.listHistory(30, today),
      statsService.sessionCountsByDay(userId, today, today),
      statsService.sessionCountsByDay(userId, addDays(today, -6), today),
    ]);

  const currentWeekLabel = weekLabel(today, config);
  const joursActifs7j = Object.values(sessions7j).filter((n) => n > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <RegulariteHeader
        weekLabel={currentWeekLabel}
        streak={streak.streak}
        gelsSerieRestants={config.gelsSerieRestants}
        sessionsToday={sessionsTodayMap[today] ?? 0}
        visibleAlerts={visibleAlerts}
        alertHistory={alertHistory}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <DeadlineChecklist deadlines={deadlines} subjects={subjects} today={today} />

        {!config.debutS3 ? (
          <EmptyState
            title="Configurez le début du S3"
            description="La heatmap et les labels de semaine (sXs3/sXs4) ont besoin de la date de début du semestre."
            actions={
              <Link href="/reglages" isStandalone hasUnderline>
                Aller aux réglages
              </Link>
            }
          />
        ) : (
          <RightColumn
            userId={userId}
            today={today}
            config={config}
            joursActifs7j={joursActifs7j}
            bestStreak={streak.bestStreak}
          />
        )}
      </div>
    </div>
  );
}

async function RightColumn({
  userId,
  today,
  config,
  joursActifs7j,
  bestStreak,
}: {
  userId: string;
  today: string;
  config: Awaited<ReturnType<typeof accountService.getPlannerConfig>>;
  joursActifs7j: number;
  bestStreak: number;
}) {
  const heatmapFrom = config.debutS3!;
  const heatmapTo = addDays(today, 14);

  const [heatmap, chargeParJour, detteReports] = await Promise.all([
    statsService.heatmapData(userId, heatmapFrom, heatmapTo),
    statsService.chargeParJour(userId, today),
    statsService.detteReports(today),
  ]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <ActivityHeatmap
        sessionCounts={heatmap.sessionCounts}
        gelDates={heatmap.gelDates}
        deadlineDates={heatmap.deadlineDates}
        today={today}
        from={heatmapFrom}
        to={heatmapTo}
        weekConfig={config}
      />
      <div className="hidden md:block">
        <ChargeChart chargeParJour={chargeParJour} deadlineDates={heatmap.deadlineDates} days={14} />
      </div>
      <div className="md:hidden">
        <ChargeChart chargeParJour={chargeParJour} deadlineDates={heatmap.deadlineDates} days={7} />
      </div>
      <StatsPanel joursActifs7j={joursActifs7j} detteReports={detteReports} bestStreak={bestStreak} />
    </div>
  );
}
