"use client";

import { weekLabel, type WeekLabelConfig } from "@/core/planner/weekLabel";

// U28 ActivityHeatmap (IMPLEMENT_SCHEDULE.md §4, §7) — CSS grid pure, aucune lib
// de charting (TECH_MAPPING §4.2, même doctrine que HorizonChart). Buckets
// d'intensité 0/1-2/3-4/5+ ; bordure rouge = échéance non-"autre" ; teinte
// violette = jour gelé ; contour fort = aujourd'hui ; jours futurs grisés.

const JOURS = ["L", "M", "M", "J", "V", "S", "D"];

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function mondayOnOrBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = lundi
  return addDays(iso, -dow);
}

function buildWeeks(from: string, to: string): string[][] {
  const weeks: string[][] = [];
  let cursor = mondayOnOrBefore(from);
  while (cursor <= to) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

function bucketClass(n: number): string {
  if (n === 0) return "bg-surface";
  if (n <= 2) return "bg-accent-bg/30";
  if (n <= 4) return "bg-accent-bg/65";
  return "bg-accent-bg";
}

export function ActivityHeatmap({
  sessionCounts,
  gelDates,
  deadlineDates,
  today,
  from,
  to,
  weekConfig,
}: {
  sessionCounts: Record<string, number>;
  gelDates: string[];
  deadlineDates: string[];
  today: string;
  from: string;
  to: string;
  weekConfig: WeekLabelConfig;
}) {
  const weeks = buildWeeks(from, to);
  const gel = new Set(gelDates);
  const deadlines = new Set(deadlineDates);

  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={`Activité d'étude du ${from} au ${to} : ${Object.values(sessionCounts).reduce((a, b) => a + b, 0)} sessions au total.`}
        className="flex gap-1 overflow-x-auto pb-1"
      >
        <div className="flex flex-col items-end gap-1 pt-5">
          {JOURS.map((j, i) => (
            <span key={i} className="text-secondary h-3 text-xs leading-3">
              {j}
            </span>
          ))}
        </div>
        {weeks.map((week, wi) => {
          const label = weekLabel(week[0], weekConfig);
          return (
            <div key={wi} className="flex flex-col items-center gap-1">
              <span className="text-secondary text-xs whitespace-nowrap">{label ?? ""}</span>
              <div className="flex flex-col gap-1">
                {week.map((day) => {
                  const n = sessionCounts[day] ?? 0;
                  const isFuture = day > today;
                  const isToday = day === today;
                  const hasDeadline = deadlines.has(day);
                  const isGel = gel.has(day);
                  return (
                    <div
                      key={day}
                      title={`${day} — ${n} session(s)${hasDeadline ? " — échéance" : ""}${isGel ? " — gel de série" : ""}`}
                      className={[
                        "h-3 w-3 rounded-none",
                        isGel ? "bg-purple-500/50" : bucketClass(n),
                        isFuture ? "opacity-40" : "",
                        hasDeadline ? "outline outline-1 outline-error" : "",
                        isToday ? "ring-2 ring-accent" : "",
                      ].join(" ")}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-secondary flex items-center gap-3 text-xs">
        <span className="flex items-center gap-1">
          <span className="bg-surface h-3 w-3 rounded-none" /> 0
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-accent-bg/30 h-3 w-3 rounded-none" /> 1-2
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-accent-bg/65 h-3 w-3 rounded-none" /> 3-4
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-accent-bg h-3 w-3 rounded-none" /> 5+
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-purple-500/50 h-3 w-3 rounded-none" /> gel
        </span>
      </div>
    </div>
  );
}
