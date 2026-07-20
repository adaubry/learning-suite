// P11 · computeStreak (IMPLEMENT_SCHEDULE.md §4) — pur, sans I/O.
// Série de jours actifs : consécutifs en remontant depuis aujourd'hui où une
// session a eu lieu OU un gel protège le jour. Aujourd'hui ne casse jamais la
// série tant qu'elle n'est pas encore jouée (journée pas finie) — ni compté ni
// cassant s'il est vide. Meilleure série : même règle sur tout l'historique
// connu (sessionDates ∪ gelDates).

export interface ComputeStreakInput {
  today: string; // ISO date
  sessionDates: string[]; // dates ISO distinctes avec >= 1 session terminée
  gelDates: string[]; // dates ISO protégées par un gel de série
}

export interface StreakResult {
  streak: number;
  bestStreak: number;
}

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function computeStreak({ today, sessionDates, gelDates }: ComputeStreakInput): StreakResult {
  const sessions = new Set(sessionDates);
  const gels = new Set(gelDates);
  const qualifies = (day: string) => sessions.has(day) || gels.has(day);

  let streak = 0;
  let cursor = today;
  let isToday = true;
  while (true) {
    if (qualifies(cursor)) {
      streak++;
    } else if (!isToday) {
      break;
    }
    isToday = false;
    cursor = addDays(cursor, -1);
  }

  let best = streak;
  const allDates = [...sessions, ...gels];
  if (allDates.length > 0) {
    const minDate = allDates.sort()[0];
    let run = 0;
    for (let day = minDate; day <= today; day = addDays(day, 1)) {
      run = qualifies(day) ? run + 1 : 0;
      if (run > best) best = run;
    }
  }

  return { streak, bestStreak: best };
}
