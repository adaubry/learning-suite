// P8 · computeHorizon (FUNCTIONS §1, ARCHITECTURE §3) — pur, sans I/O.
// ReviewCards → charge de révision 7/30 jours (fenêtres [today, today+7[ et
// [today, today+30[, today inclus), dette (due < today, exclue des deux
// charges — bucket séparé), répartition par matière, échéances d'examens
// futures superposées. Le backlog d'études (sans date d'échéance) ne figure
// jamais ici (FUNCTIONS §1) : seul le type d'entrée (ReviewCard) le garantit.

export interface HorizonReviewCard {
  sectionId: string;
  due: string; // ISO date
  subjectId: string;
}

export interface HorizonSubject {
  subjectId: string;
  chargeJ7: number;
  chargeJ30: number;
  dette: number;
}

export interface HorizonExam {
  subjectId: string;
  dateExamen: string;
  joursRestants: number;
}

export interface Horizon {
  chargeJ7: number;
  chargeJ30: number;
  dette: number;
  parMatiere: HorizonSubject[];
  examens: HorizonExam[];
}

export interface ComputeHorizonInput {
  today: string; // ISO date
  reviewCards: HorizonReviewCard[];
  /** subjectId -> date d'examen ISO, ou null/absent si aucune. */
  examDates: Record<string, string | null | undefined>;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

function emptySubjectBucket(subjectId: string): HorizonSubject {
  return { subjectId, chargeJ7: 0, chargeJ30: 0, dette: 0 };
}

export function computeHorizon(input: ComputeHorizonInput): Horizon {
  const { today, reviewCards, examDates } = input;

  const bySubject = new Map<string, HorizonSubject>();
  const bucketFor = (subjectId: string) => {
    let bucket = bySubject.get(subjectId);
    if (!bucket) {
      bucket = emptySubjectBucket(subjectId);
      bySubject.set(subjectId, bucket);
    }
    return bucket;
  };

  let chargeJ7 = 0;
  let chargeJ30 = 0;
  let dette = 0;

  for (const card of reviewCards) {
    const diff = daysBetween(today, card.due);
    const bucket = bucketFor(card.subjectId);

    if (diff < 0) {
      dette += 1;
      bucket.dette += 1;
      continue;
    }
    if (diff < 30) {
      chargeJ30 += 1;
      bucket.chargeJ30 += 1;
    }
    if (diff < 7) {
      chargeJ7 += 1;
      bucket.chargeJ7 += 1;
    }
  }

  const examens: HorizonExam[] = Object.entries(examDates)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([subjectId, dateExamen]) => ({ subjectId, dateExamen, joursRestants: daysBetween(today, dateExamen) }))
    .filter((e) => e.joursRestants >= 0)
    .sort((a, b) => a.joursRestants - b.joursRestants);

  return {
    chargeJ7,
    chargeJ30,
    dette,
    parMatiere: [...bySubject.values()],
    examens,
  };
}
