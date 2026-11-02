import { describe, expect, it } from "vitest";
import { buildDailyQueue, type BuildDailyQueueInput, type QueueItem } from "./buildDailyQueue";

// Aide de test : `ficheId` n'existe que sur les variantes revision/nouvelle_etude.
function ficheIdOf(item: QueueItem): string {
  if (item.kind === "re_file") throw new Error("pas de ficheId sur re_file");
  return item.ficheId;
}

// @canary — cas limites de la file du jour (file vide, tout en retard, plafond 0,
// examen passé, re-file en queue). Un canari rouge invalide la modification qui
// l'a cassé, jamais l'inverse (AGENTS §2.5).

const baseInput: BuildDailyQueueInput = {
  today: "2026-07-09",
  reviewCards: [],
  newStudyCandidates: [],
  refileToday: [],
  examDates: {},
  nouvellesParJour: 3,
};

describe("buildDailyQueue · cas limites (@canary)", () => {
  it("file vide : aucune révision, aucune étude, aucune re-file ⇒ []", () => {
    expect(buildDailyQueue(baseInput)).toEqual([]);
  });

  it("tout en retard : plusieurs révisions en retard, triées du plus en retard au moins en retard", () => {
    const queue = buildDailyQueue({
      ...baseInput,
      reviewCards: [
        { ficheId: "a", due: "2026-07-05", subjectId: "s1" },
        { ficheId: "b", due: "2026-06-01", subjectId: "s1" },
        { ficheId: "c", due: "2026-07-08", subjectId: "s1" },
      ],
    });
    expect(queue.map(ficheIdOf)).toEqual(["b", "a", "c"]);
    expect(queue.every((q) => q.kind === "revision")).toBe(true);
  });

  it("plafond 0 : aucune nouvelle étude n'entre dans la file quelle que soit la taille du vivier", () => {
    const queue = buildDailyQueue({
      ...baseInput,
      newStudyCandidates: [
        { ficheId: "c1", subjectId: "s1", ordreCurriculum: 0 },
        { ficheId: "c2", subjectId: "s1", ordreCurriculum: 1 },
      ],
      nouvellesParJour: 0,
    });
    expect(queue).toEqual([]);
  });

  it("examen passé : traité comme aucun examen, aucune priorité artificielle ", () => {
    const queue = buildDailyQueue({
      ...baseInput,
      reviewCards: [
        { ficheId: "examen-passe", due: "2026-07-09", subjectId: "passe" },
        { ficheId: "sans-examen", due: "2026-07-09", subjectId: "aucun" },
      ],
      examDates: { passe: "2026-01-01" }, // largement antérieur à `today`
    });
    // même retard : aucun des deux n'est avantagé par l'examen
    // passé, l'ordre relatif n'est pas dicté par la proximité d'examen ⇒ les deux
    // portent `joursAvantExamen: null`.
    expect(queue.every((q) => "joursAvantExamen" in q && q.joursAvantExamen === null)).toBe(true);
  });

  it("re-file intra-journée : toujours en queue, après révisions ET nouvelles études", () => {
    const queue = buildDailyQueue({
      ...baseInput,
      reviewCards: [{ ficheId: "rev", due: "2026-07-01", subjectId: "s1" }],
      newStudyCandidates: [{ ficheId: "new", subjectId: "s1", ordreCurriculum: 0 }],
      refileToday: [
        { itemType: "revision", itemId: "refile-rev" },
        { itemType: "etude", itemId: "refile-etude" },
      ],
    });
    expect(queue.map((q) => q.kind)).toEqual(["revision", "nouvelle_etude", "re_file", "re_file"]);
    expect(queue[2]).toEqual({ kind: "re_file", itemType: "revision", itemId: "refile-rev" });
    expect(queue[3]).toEqual({ kind: "re_file", itemType: "etude", itemId: "refile-etude" });
  });
});
