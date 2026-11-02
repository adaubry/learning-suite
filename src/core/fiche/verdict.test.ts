import { describe, expect, it } from "vitest";
import { bilanAutoEvaluation, normaliserCoches } from "./verdict";
import type { PointFiche } from "./extractPoints";

const p = (type: PointFiche["type"], raisonnement = false): PointFiche => ({
  type,
  raisonnement,
  etiquette: "x",
  intitule: "x",
  attendu: "x",
});

// thèse (0), définition (1), cause (2), constat (3), lien (4)
const points = [p("critique"), p("critique"), p("important", true), p("important"), p("secondaire")];

describe("bilanAutoEvaluation", () => {
  it("bon si tous les points essentiels sont cochés, quel que soit le reste", () => {
    expect(bilanAutoEvaluation(points, [0, 1])).toEqual({
      verdict: "bon",
      points: { couverts: 2, total: 5 },
      essentiels: { couverts: 2, total: 2 },
      raisonnement: { couverts: 0, total: 1 },
    });
  });

  it("insuffisant dès qu'un point essentiel n'est pas coché", () => {
    expect(bilanAutoEvaluation(points, [0, 2, 3, 4]).verdict).toBe("insuffisant");
  });

  it("une fiche sans point essentiel n'est jamais insuffisante", () => {
    expect(bilanAutoEvaluation([p("important")], []).verdict).toBe("bon");
  });

  it("ignore les indices invalides ou en double", () => {
    expect(bilanAutoEvaluation(points, [0, 0, 1, 9, -1]).points).toEqual({ couverts: 2, total: 5 });
  });
});

describe("normaliserCoches", () => {
  it("garde les indices entiers dans les bornes, sans doublon, triés", () => {
    expect(normaliserCoches([3, 1, 1, 7, -2, 1.5], 5)).toEqual([1, 3]);
  });
});
