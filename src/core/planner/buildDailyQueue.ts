// P7 · buildDailyQueue (FUNCTIONS §1, ARCHITECTURE §3) — pur, sans I/O.
// Compose la file du jour : révisions dues (retard DESC, importance DESC,
// proximité d'examen) → nouvelles études plafonnées (importance DESC,
// proximité d'examen, ordre curriculum) → re-file intra-journée en queue.
// `newStudyCandidates` est déjà filtré par l'appelant (section `prete` jamais
// étudiée — nécessite la base, hors de portée d'une fonction pure) ; le tri et
// le plafond restent ici. `dueReviews`, en revanche, n'a besoin d'aucune
// connaissance externe pour filtrer `due <= today` : fait ici.

export interface ReviewCardInput {
  sectionId: string;
  due: string; // ISO date (YYYY-MM-DD)
  importance: number;
  subjectId: string;
}

export interface NewStudyCandidate {
  sectionId: string;
  importance: number;
  subjectId: string;
  ordreCurriculum: number;
}

export interface RefileToday {
  itemType: "etude" | "revision";
  itemId: string;
}

export type QueueItem =
  | {
      kind: "revision";
      sectionId: string;
      subjectId: string;
      importance: number;
      retardJours: number;
      joursAvantExamen: number | null;
    }
  | {
      kind: "nouvelle_etude";
      sectionId: string;
      subjectId: string;
      importance: number;
      joursAvantExamen: number | null;
    }
  | { kind: "re_file"; itemType: "etude" | "revision"; itemId: string };

export interface BuildDailyQueueInput {
  today: string; // ISO date
  reviewCards: ReviewCardInput[];
  newStudyCandidates: NewStudyCandidate[];
  refileToday: RefileToday[];
  /** subjectId -> date d'examen ISO, ou null/absent si aucune. */
  examDates: Record<string, string | null | undefined>;
  nouvellesParJour: number;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

// DECISIONS.md bloc 6.1 : un examen déjà passé compte comme « pas d'examen »
// (distance infinie) — pas d'urgence artificielle une fois l'échéance dépassée.
function joursAvantExamen(today: string, subjectId: string, examDates: BuildDailyQueueInput["examDates"]): number | null {
  const date = examDates[subjectId];
  if (!date) return null;
  const diff = daysBetween(today, date);
  return diff < 0 ? null : diff;
}

const INFINI = Number.POSITIVE_INFINITY;

export function buildDailyQueue(input: BuildDailyQueueInput): QueueItem[] {
  const { today, reviewCards, newStudyCandidates, refileToday, examDates, nouvellesParJour } = input;

  const revisions: QueueItem[] = reviewCards
    .filter((c) => c.due <= today)
    .map((c) => ({
      kind: "revision" as const,
      sectionId: c.sectionId,
      subjectId: c.subjectId,
      importance: c.importance,
      retardJours: daysBetween(c.due, today),
      joursAvantExamen: joursAvantExamen(today, c.subjectId, examDates),
    }))
    .sort(
      (a, b) =>
        b.retardJours - a.retardJours ||
        b.importance - a.importance ||
        (a.joursAvantExamen ?? INFINI) - (b.joursAvantExamen ?? INFINI),
    );

  const nouvelles: QueueItem[] = newStudyCandidates
    .map((c) => ({
      kind: "nouvelle_etude" as const,
      sectionId: c.sectionId,
      subjectId: c.subjectId,
      importance: c.importance,
      joursAvantExamen: joursAvantExamen(today, c.subjectId, examDates),
      ordreCurriculum: c.ordreCurriculum,
    }))
    .sort(
      (a, b) =>
        b.importance - a.importance ||
        (a.joursAvantExamen ?? INFINI) - (b.joursAvantExamen ?? INFINI) ||
        a.ordreCurriculum - b.ordreCurriculum,
    )
    .slice(0, Math.max(0, nouvellesParJour))
    .map((c) => ({
      kind: c.kind,
      sectionId: c.sectionId,
      subjectId: c.subjectId,
      importance: c.importance,
      joursAvantExamen: c.joursAvantExamen,
    }));

  const refile: QueueItem[] = refileToday.map((r) => ({ kind: "re_file", itemType: r.itemType, itemId: r.itemId }));

  return [...revisions, ...nouvelles, ...refile];
}
