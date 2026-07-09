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
// Exportée : même règle réutilisée par S3.lazyScheduler (guide.ts, Bloc 6.4),
// qui trie des sections `active` en dehors de buildDailyQueue.
export function joursAvantExamen(today: string, dateExamen: string | null | undefined): number | null {
  if (!dateExamen) return null;
  const diff = daysBetween(today, dateExamen);
  return diff < 0 ? null : diff;
}

// Tiebreaker « ordre curriculum » (matière → maj du chapitre → position dans le
// chapitre) : aucun champ dédié en base (DECISIONS.md bloc 6.3). Exporté : même
// tri réutilisé par S5.loadReadyStudyCandidates (planner.ts) et S3.lazyScheduler
// (guide.ts) pour construire `ordreCurriculum`/trier les sections `active`.
export function compareOrdreCurriculum(
  a: { subjectOrdre: number; chapterMaj: Date; sectionOrdre: number },
  b: { subjectOrdre: number; chapterMaj: Date; sectionOrdre: number },
): number {
  return (
    a.subjectOrdre - b.subjectOrdre ||
    a.chapterMaj.getTime() - b.chapterMaj.getTime() ||
    a.sectionOrdre - b.sectionOrdre
  );
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
      joursAvantExamen: joursAvantExamen(today, examDates[c.subjectId]),
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
      joursAvantExamen: joursAvantExamen(today, examDates[c.subjectId]),
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
