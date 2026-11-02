import { describe, expect, it } from "vitest";
import { buildDailyQueue, type BuildDailyQueueInput, type QueueItem } from "./buildDailyQueue";

// Aide de test : `ficheId` n'existe que sur les variantes revision/nouvelle_etude.
function ficheIdOf(item: QueueItem): string {
  if (item.kind === "re_file") throw new Error("pas de ficheId sur re_file");
  return item.ficheId;
}

const baseInput: BuildDailyQueueInput = {
  today: "2026-07-09",
  reviewCards: [],
  newStudyCandidates: [],
  refileToday: [],
  examDates: {},
  nouvellesParJour: 3,
};

describe("buildDailyQueue", () => {
  it("filtre les ReviewCard dont due > today (pas encore dues)", () => {
    const queue = buildDailyQueue({
      ...baseInput,
      reviewCards: [{ ficheId: "future", due: "2026-07-10", subjectId: "s1" }],
    });
    expect(queue).toHaveLength(0);
  });

  it("inclut une carte due exactement aujourd'hui (retard 0)", () => {
    const queue = buildDailyQueue({
      ...baseInput,
      reviewCards: [{ ficheId: "today", due: "2026-07-09", subjectId: "s1" }],
    });
    expect(queue).toEqual([
      { kind: "revision", ficheId: "today", subjectId: "s1", retardJours: 0, joursAvantExamen: null },
    ]);
  });

  it("trie les révisions par retard DESC d'abord", () => {
    const queue = buildDailyQueue({
      ...baseInput,
      reviewCards: [
        { ficheId: "peu-retard", due: "2026-07-08", subjectId: "s1" },
        { ficheId: "gros-retard", due: "2026-07-01", subjectId: "s1" },
      ],
    });
    expect(queue.map(ficheIdOf)).toEqual(["gros-retard", "peu-retard"]);
  });

  it("à retard égal, trie par proximité d'examen ASC", () => {
    const queue = buildDailyQueue({
      ...baseInput,
      reviewCards: [
        { ficheId: "loin", due: "2026-07-08", subjectId: "loin-sujet" },
        { ficheId: "proche", due: "2026-07-08", subjectId: "proche-sujet" },
      ],
      examDates: { "loin-sujet": "2026-09-01", "proche-sujet": "2026-07-15" },
    });
    expect(queue.map(ficheIdOf)).toEqual(["proche", "loin"]);
  });

  it("nouvelles fiches : plafonnées à nouvellesParJour, triées par ordre curriculum", () => {
    const queue = buildDailyQueue({
      ...baseInput,
      newStudyCandidates: [
        { ficheId: "c1", subjectId: "s1", ordreCurriculum: 2 },
        { ficheId: "c2", subjectId: "s1", ordreCurriculum: 1 },
        { ficheId: "c3", subjectId: "s1", ordreCurriculum: 0 },
        { ficheId: "c4", subjectId: "s1", ordreCurriculum: 3 },
      ],
      nouvellesParJour: 2,
    });
    expect(queue.map(ficheIdOf)).toEqual(["c3", "c2"]);
  });

  it("nouvelles fiches : l'examen le plus proche passe avant l'ordre curriculum", () => {
    const queue = buildDailyQueue({
      ...baseInput,
      newStudyCandidates: [
        { ficheId: "loin", subjectId: "a", ordreCurriculum: 0 },
        { ficheId: "proche", subjectId: "b", ordreCurriculum: 1 },
      ],
      examDates: { a: "2026-12-01", b: "2026-07-20" },
    });
    expect(queue.map(ficheIdOf)).toEqual(["proche", "loin"]);
  });

  it("révisions toujours avant nouvelles études, elles-mêmes avant re-file", () => {
    const queue = buildDailyQueue({
      today: "2026-07-09",
      reviewCards: [{ ficheId: "rev", due: "2026-07-09", subjectId: "s1" }],
      newStudyCandidates: [{ ficheId: "new", subjectId: "s1", ordreCurriculum: 0 }],
      refileToday: [{ itemType: "etude", itemId: "refile-1" }],
      examDates: {},
      nouvellesParJour: 3,
    });
    expect(queue.map((q) => q.kind)).toEqual(["revision", "nouvelle_etude", "re_file"]);
  });

  it("un examen sans date connue (absent de examDates) ⇒ joursAvantExamen null", () => {
    const queue = buildDailyQueue({
      ...baseInput,
      reviewCards: [{ ficheId: "s", due: "2026-07-09", subjectId: "sans-date" }],
    });
    expect(queue[0]).toMatchObject({ joursAvantExamen: null });
  });
});
