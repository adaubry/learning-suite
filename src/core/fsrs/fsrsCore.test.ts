import { describe, expect, it } from "vitest";
import { createInitialState, previewIntervals, rate, type CardState } from "./fsrsCore";

const NOW = new Date("2026-07-09T00:00:00.000Z");

describe("fsrsCore · P9", () => {
  it("createInitialState : carte New, reps=0, due aujourd'hui", () => {
    const state = createInitialState(NOW);
    expect(state).toMatchObject({ reps: 0, lapses: 0, lastReview: null, due: "2026-07-09" });
  });

  it("rate : Again ⇒ échéance plus proche que Easy sur une carte neuve", () => {
    const state = createInitialState(NOW);
    const again = rate(state, "again", NOW);
    const easy = rate(state, "easy", NOW);
    expect(new Date(again.due).getTime()).toBeLessThan(new Date(easy.due).getTime());
  });

  it("rate : reps incrémenté, lastReview posé sur la date de notation", () => {
    const state = createInitialState(NOW);
    const next = rate(state, "good", NOW);
    expect(next.reps).toBe(1);
    expect(next.lastReview).not.toBeNull();
  });

  it("rate : Again sur une carte déjà revue incrémente lapses, sans jamais renvoyer un état Learning/Relearning caché (ARCHITECTURE §8 : seules due/stability/difficulty/reps/lapses/lastReview existent)", () => {
    const state = createInitialState(NOW);
    const afterGood = rate(state, "good", NOW);
    const later = new Date("2026-07-20T00:00:00.000Z");
    const afterAgain = rate(afterGood, "again", later);
    expect(afterAgain.lapses).toBe(1);
    expect(afterAgain.reps).toBe(2);
  });

  it("previewIntervals : simule les 4 notes sans muter l'état d'entrée", () => {
    const state = createInitialState(NOW);
    const frozen: CardState = { ...state };
    const preview = previewIntervals(state, NOW);
    expect(state).toEqual(frozen);
    expect(Object.keys(preview).sort()).toEqual(["again", "easy", "good", "hard"]);
    // ordre croissant des échéances Again ≤ Hard ≤ Good ≤ Easy sur une carte neuve
    const dues = ["again", "hard", "good", "easy"].map((n) => new Date(preview[n as keyof typeof preview].due).getTime());
    expect(dues).toEqual([...dues].sort((a, b) => a - b));
  });

  it("previewIntervals : cohérent avec rate (même note ⇒ même résultat)", () => {
    const state = createInitialState(NOW);
    const preview = previewIntervals(state, NOW);
    const rated = rate(state, "hard", NOW);
    expect(rated).toEqual(preview.hard);
  });
});
