import { describe, expect, it } from "vitest";
import { buildDailyQueue, type BuildDailyQueueInput, type QueueItem } from "./buildDailyQueue";

// Aide de test : `sectionId` n'existe que sur les variantes revision/nouvelle_etude.
function sectionIdOf(item: QueueItem): string {
  if (item.kind === "re_file") throw new Error("pas de sectionId sur re_file");
  return item.sectionId;
}

const baseInput: BuildDailyQueueInput = {
  today: "2026-07-09",
  reviewCards: [],
  newStudyCandidates: [],
  refileToday: [],
  examDates: {},
  nouvellesParJour: 3,
};

describe("buildDailyQueue · P7", () => {
  it("filtre les ReviewCard dont due > today (pas encore dues)", () => {
    const queue = buildDailyQueue({
      ...baseInput,
      reviewCards: [{ sectionId: "future", due: "2026-07-10", importance: 5, subjectId: "s1" }],
    });
    expect(queue).toHaveLength(0);
  });

  it("inclut une carte due exactement aujourd'hui (retard 0)", () => {
    const queue = buildDailyQueue({
      ...baseInput,
      reviewCards: [{ sectionId: "today", due: "2026-07-09", importance: 3, subjectId: "s1" }],
    });
    expect(queue).toEqual([
      { kind: "revision", sectionId: "today", subjectId: "s1", importance: 3, retardJours: 0, joursAvantExamen: null },
    ]);
  });

  it("trie les révisions par retard DESC d'abord", () => {
    const queue = buildDailyQueue({
      ...baseInput,
      reviewCards: [
        { sectionId: "peu-retard", due: "2026-07-08", importance: 5, subjectId: "s1" },
        { sectionId: "gros-retard", due: "2026-07-01", importance: 1, subjectId: "s1" },
      ],
    });
    expect(queue.map(sectionIdOf)).toEqual(["gros-retard", "peu-retard"]);
  });

  it("à retard égal, trie par importance DESC", () => {
    const queue = buildDailyQueue({
      ...baseInput,
      reviewCards: [
        { sectionId: "faible", due: "2026-07-08", importance: 2, subjectId: "s1" },
        { sectionId: "forte", due: "2026-07-08", importance: 5, subjectId: "s1" },
      ],
    });
    expect(queue.map(sectionIdOf)).toEqual(["forte", "faible"]);
  });

  it("à retard et importance égaux, trie par proximité d'examen ASC", () => {
    const queue = buildDailyQueue({
      ...baseInput,
      reviewCards: [
        { sectionId: "loin", due: "2026-07-08", importance: 3, subjectId: "loin-sujet" },
        { sectionId: "proche", due: "2026-07-08", importance: 3, subjectId: "proche-sujet" },
      ],
      examDates: { "loin-sujet": "2026-09-01", "proche-sujet": "2026-07-15" },
    });
    expect(queue.map(sectionIdOf)).toEqual(["proche", "loin"]);
  });

  it("nouvelles études : plafonnées à nouvellesParJour, triées importance DESC puis ordre curriculum", () => {
    const queue = buildDailyQueue({
      ...baseInput,
      newStudyCandidates: [
        { sectionId: "c1", importance: 3, subjectId: "s1", ordreCurriculum: 2 },
        { sectionId: "c2", importance: 5, subjectId: "s1", ordreCurriculum: 1 },
        { sectionId: "c3", importance: 5, subjectId: "s1", ordreCurriculum: 0 },
        { sectionId: "c4", importance: 1, subjectId: "s1", ordreCurriculum: 3 },
      ],
      nouvellesParJour: 2,
    });
    expect(queue.map(sectionIdOf)).toEqual(["c3", "c2"]);
  });

  it("révisions toujours avant nouvelles études, elles-mêmes avant re-file", () => {
    const queue = buildDailyQueue({
      today: "2026-07-09",
      reviewCards: [{ sectionId: "rev", due: "2026-07-09", importance: 1, subjectId: "s1" }],
      newStudyCandidates: [{ sectionId: "new", importance: 5, subjectId: "s1", ordreCurriculum: 0 }],
      refileToday: [{ itemType: "etude", itemId: "refile-1" }],
      examDates: {},
      nouvellesParJour: 3,
    });
    expect(queue.map((q) => q.kind)).toEqual(["revision", "nouvelle_etude", "re_file"]);
  });

  it("un examen sans date connue (absent de examDates) ⇒ joursAvantExamen null", () => {
    const queue = buildDailyQueue({
      ...baseInput,
      reviewCards: [{ sectionId: "s", due: "2026-07-09", importance: 3, subjectId: "sans-date" }],
    });
    expect(queue[0]).toMatchObject({ joursAvantExamen: null });
  });
});
