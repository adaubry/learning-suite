// U29 ChargeChart (IMPLEMENT_SCHEDULE.md §4, §7) — barres pures CSS, même
// doctrine que HorizonChart/U11 (TECH_MAPPING §4.2, zéro lib de charts).

export function ChargeChart({
  chargeParJour,
  deadlineDates,
  days = 14,
}: {
  chargeParJour: Record<string, number>;
  deadlineDates: string[];
  days?: number;
}) {
  const dates = Object.keys(chargeParJour)
    .filter((d) => d in chargeParJour)
    .sort()
    .slice(0, days);
  const max = Math.max(1, ...dates.map((d) => chargeParJour[d]));
  const deadlines = new Set(deadlineDates);
  const moyenne = dates.length ? dates.reduce((sum, d) => sum + chargeParJour[d], 0) / dates.length : 0;
  const pic = dates.some((d) => chargeParJour[d] > moyenne * 2);

  return (
    <div className="flex flex-col gap-2 rounded-none border border-border bg-surface p-4">
      <div className="flex items-end gap-1">
        {dates.map((d) => (
          <div key={d} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-24 w-full items-end">
              <div
                className={deadlines.has(d) ? "bg-error w-full" : "bg-accent-bg w-full"}
                style={{ height: `${(chargeParJour[d] / max) * 100}%` }}
                title={`${d} — ${chargeParJour[d]} carte(s)${deadlines.has(d) ? " — échéance" : ""}`}
              />
            </div>
            <span className="text-secondary text-xs">{d.slice(5)}</span>
          </div>
        ))}
      </div>
      {pic && <p className="text-error text-sm">Charge inhabituellement élevée à l&apos;approche d&apos;une échéance.</p>}
    </div>
  );
}
