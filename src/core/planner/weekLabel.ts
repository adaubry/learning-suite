// P12 · weekLabel (IMPLEMENT_SCHEDULE.md §4) — pur, sans I/O.
// `s{floor((jour - debutSx)/7) + 1}s{3|4}` selon que `jour >= debutS4` ou non.
// `debutS3` null ⇒ pas de label (l'écran affiche un empty state de config).

export interface WeekLabelConfig {
  debutS3: string | null; // ISO date, lundi de la semaine 1 du S3
  debutS4: string | null;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.floor((to - from) / 86_400_000);
}

export function weekLabel(day: string, { debutS3, debutS4 }: WeekLabelConfig): string | null {
  if (!debutS3) return null;
  const useS4 = debutS4 !== null && day >= debutS4;
  const start = useS4 ? debutS4! : debutS3;
  const week = Math.floor(daysBetween(start, day) / 7) + 1;
  return `s${week}s${useS4 ? 4 : 3}`;
}
