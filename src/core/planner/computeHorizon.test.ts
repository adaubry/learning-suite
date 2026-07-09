import { describe, expect, it } from "vitest";
import { computeHorizon, type ComputeHorizonInput } from "./computeHorizon";

const baseInput: ComputeHorizonInput = {
  today: "2026-07-09",
  reviewCards: [],
  examDates: {},
};

describe("computeHorizon · P8", () => {
  it("aucune carte ⇒ horizon à zéro, aucune répartition, aucun examen", () => {
    expect(computeHorizon(baseInput)).toEqual({
      chargeJ7: 0,
      chargeJ30: 0,
      dette: 0,
      parMatiere: [],
      examens: [],
    });
  });

  it("carte due aujourd'hui ⇒ comptée dans J7 ET J30, pas en dette", () => {
    const h = computeHorizon({
      ...baseInput,
      reviewCards: [{ sectionId: "a", due: "2026-07-09", subjectId: "s1" }],
    });
    expect(h).toMatchObject({ chargeJ7: 1, chargeJ30: 1, dette: 0 });
  });

  it("carte due hier ⇒ dette uniquement, absente des charges J7/J30", () => {
    const h = computeHorizon({
      ...baseInput,
      reviewCards: [{ sectionId: "a", due: "2026-07-08", subjectId: "s1" }],
    });
    expect(h).toMatchObject({ chargeJ7: 0, chargeJ30: 0, dette: 1 });
  });

  it("carte due dans 6 jours ⇒ J7 et J30 ; due dans 7 jours ⇒ J30 seulement (fenêtre [today, today+7[)", () => {
    const h = computeHorizon({
      ...baseInput,
      reviewCards: [
        { sectionId: "in6", due: "2026-07-15", subjectId: "s1" },
        { sectionId: "in7", due: "2026-07-16", subjectId: "s1" },
      ],
    });
    expect(h.chargeJ7).toBe(1);
    expect(h.chargeJ30).toBe(2);
  });

  it("carte due dans 29 jours ⇒ J30 ; due dans 30 jours ⇒ hors fenêtre", () => {
    const h = computeHorizon({
      ...baseInput,
      reviewCards: [
        { sectionId: "in29", due: "2026-08-07", subjectId: "s1" },
        { sectionId: "in30", due: "2026-08-08", subjectId: "s1" },
      ],
    });
    expect(h.chargeJ30).toBe(1);
  });

  it("répartit par matière indépendamment du total", () => {
    const h = computeHorizon({
      today: "2026-07-09",
      reviewCards: [
        { sectionId: "a", due: "2026-07-09", subjectId: "droit-civil" },
        { sectionId: "b", due: "2026-07-08", subjectId: "droit-penal" },
      ],
      examDates: {},
    });
    expect(h.parMatiere).toEqual(
      expect.arrayContaining([
        { subjectId: "droit-civil", chargeJ7: 1, chargeJ30: 1, dette: 0 },
        { subjectId: "droit-penal", chargeJ7: 0, chargeJ30: 0, dette: 1 },
      ]),
    );
  });

  it("liste les examens futurs triés par proximité, exclut ceux sans date et ceux déjà passés", () => {
    const h = computeHorizon({
      ...baseInput,
      examDates: {
        loin: "2026-09-01",
        proche: "2026-07-15",
        passe: "2026-01-01",
        "sans-date": null,
      },
    });
    expect(h.examens.map((e) => e.subjectId)).toEqual(["proche", "loin"]);
    expect(h.examens[0].joursRestants).toBe(6);
  });
});
