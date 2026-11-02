// P7 · buildDailyQueue (ARCHITECTURE.md v2 §3) — pur, sans I/O.
// Compose la file du jour : révisions dues (retard DESC, proximité d'examen) →
// nouvelles fiches (proximité d'examen, ordre curriculum), plafonnées si un plafond est fixé → re-file
// intra-journée en queue. `newStudyCandidates` est déjà filtré par l'appelant
// (fiches `nouvelle` d'un set actif) ; le tri et le plafond restent ici.

export interface ReviewCardInput {
  ficheId: string;
  due: string; // ISO date (YYYY-MM-DD)
  subjectId: string;
}

export interface NewStudyCandidate {
  ficheId: string;
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
      ficheId: string;
      subjectId: string;
      retardJours: number;
      joursAvantExamen: number | null;
    }
  | {
      kind: "nouvelle_etude";
      ficheId: string;
      subjectId: string;
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
  /** null = aucun plafond : toutes les nouvelles fiches. */
  nouvellesParJour: number | null;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

// Un examen déjà passé compte comme « pas d'examen » (distance infinie) : pas
// d'urgence artificielle une fois l'échéance dépassée.
export function joursAvantExamen(today: string, dateExamen: string | null | undefined): number | null {
  if (!dateExamen) return null;
  const diff = daysBetween(today, dateExamen);
  return diff < 0 ? null : diff;
}

// Ordre curriculum : matière → set (date de création) → numéro de fiche.
export function compareOrdreCurriculum(
  a: { subjectOrdre: number; setCreatedAt: Date; numero: number },
  b: { subjectOrdre: number; setCreatedAt: Date; numero: number },
): number {
  return (
    a.subjectOrdre - b.subjectOrdre || a.setCreatedAt.getTime() - b.setCreatedAt.getTime() || a.numero - b.numero
  );
}

const INFINI = Number.POSITIVE_INFINITY;

export function buildDailyQueue(input: BuildDailyQueueInput): QueueItem[] {
  const { today, reviewCards, newStudyCandidates, refileToday, examDates, nouvellesParJour } = input;

  const revisions: QueueItem[] = reviewCards
    .filter((c) => c.due <= today)
    .map((c) => ({
      kind: "revision" as const,
      ficheId: c.ficheId,
      subjectId: c.subjectId,
      retardJours: daysBetween(c.due, today),
      joursAvantExamen: joursAvantExamen(today, examDates[c.subjectId]),
    }))
    .sort(
      (a, b) =>
        b.retardJours - a.retardJours || (a.joursAvantExamen ?? INFINI) - (b.joursAvantExamen ?? INFINI),
    );

  const nouvelles: QueueItem[] = newStudyCandidates
    .map((c) => ({ ...c, joursAvantExamen: joursAvantExamen(today, examDates[c.subjectId]) }))
    .sort(
      (a, b) =>
        (a.joursAvantExamen ?? INFINI) - (b.joursAvantExamen ?? INFINI) || a.ordreCurriculum - b.ordreCurriculum,
    )
    .slice(0, nouvellesParJour === null ? undefined : Math.max(0, nouvellesParJour))
    .map((c) => ({
      kind: "nouvelle_etude" as const,
      ficheId: c.ficheId,
      subjectId: c.subjectId,
      joursAvantExamen: c.joursAvantExamen,
    }));

  const refile: QueueItem[] = refileToday.map((r) => ({ kind: "re_file", itemType: r.itemType, itemId: r.itemId }));

  return [...revisions, ...nouvelles, ...refile];
}
