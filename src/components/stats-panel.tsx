// U30 StatsPanel (IMPLEMENT_SCHEDULE.md §7) — jours actifs 7j, dette, meilleure
// série. Aucun pourcentage de complétion (§8 critère 4).

export function StatsPanel({
  joursActifs7j,
  detteReports,
  bestStreak,
}: {
  joursActifs7j: number;
  detteReports: number;
  bestStreak: number;
}) {
  return (
    <div className="flex gap-6 rounded-none border border-border bg-surface p-4 text-sm">
      <div>
        <div className="text-2xl font-semibold">{joursActifs7j}/7</div>
        <div className="text-secondary">jours actifs</div>
      </div>
      <div>
        <div className="text-2xl font-semibold">{detteReports}</div>
        <div className="text-secondary">dette de reports</div>
      </div>
      <div>
        <div className="text-2xl font-semibold">{bestStreak}</div>
        <div className="text-secondary">meilleure série</div>
      </div>
    </div>
  );
}
