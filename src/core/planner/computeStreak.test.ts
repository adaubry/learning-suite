import { describe, expect, it } from "vitest";
import { computeStreak } from "./computeStreak";

describe("computeStreak · P11", () => {
  it("aucune session ni gel ⇒ série à zéro", () => {
    expect(computeStreak({ today: "2026-07-20", sessionDates: [], gelDates: [] })).toEqual({
      streak: 0,
      bestStreak: 0,
    });
  });

  it("aujourd'hui vide ne casse pas la série (journée pas finie) — hier compte encore", () => {
    const r = computeStreak({
      today: "2026-07-20",
      sessionDates: ["2026-07-19", "2026-07-18"],
      gelDates: [],
    });
    expect(r.streak).toBe(2);
  });

  it("aujourd'hui joué prolonge la série", () => {
    const r = computeStreak({
      today: "2026-07-20",
      sessionDates: ["2026-07-20", "2026-07-19", "2026-07-18"],
      gelDates: [],
    });
    expect(r.streak).toBe(3);
  });

  it("un gel comble un trou et prolonge la série", () => {
    const r = computeStreak({
      today: "2026-07-20",
      sessionDates: ["2026-07-20", "2026-07-18"],
      gelDates: ["2026-07-19"],
    });
    expect(r.streak).toBe(3);
  });

  it("un vrai trou (ni session ni gel) casse la série avant lui", () => {
    const r = computeStreak({
      today: "2026-07-20",
      sessionDates: ["2026-07-20", "2026-07-19", "2026-07-16"],
      gelDates: [],
    });
    expect(r.streak).toBe(2);
  });

  it("meilleure série couvre tout l'historique, pas seulement la série courante", () => {
    const r = computeStreak({
      today: "2026-07-20",
      sessionDates: ["2026-07-20", "2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"],
      gelDates: [],
    });
    expect(r.streak).toBe(1);
    expect(r.bestStreak).toBe(5);
  });

  it("meilleure série jamais inférieure à la série courante (jour incomplet en fin d'historique)", () => {
    const r = computeStreak({
      today: "2026-07-20",
      sessionDates: ["2026-07-19", "2026-07-18", "2026-07-17"],
      gelDates: [],
    });
    expect(r.bestStreak).toBeGreaterThanOrEqual(r.streak);
    expect(r.bestStreak).toBe(3);
  });
});
