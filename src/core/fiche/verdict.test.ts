import { describe, expect, it } from "vitest";
import { computeVerdict, resumeRaisonnement, type PointCorrige } from "./verdict";

const p = (type: PointCorrige["type"], statut: PointCorrige["statut"], raisonnement = false): PointCorrige => ({
  type,
  statut,
  raisonnement,
  etiquette: "x",
  intitule: "x",
  attendu: "x",
  explication: "",
});

describe("computeVerdict", () => {
  it("bon si tous les critiques sont couverts, quel que soit le reste", () => {
    expect(computeVerdict([p("critique", "couvert"), p("important", "manquant"), p("secondaire", "deforme")])).toBe("bon");
  });

  it("insuffisant si un critique est manquant ou déformé", () => {
    expect(computeVerdict([p("critique", "manquant")])).toBe("insuffisant");
    expect(computeVerdict([p("critique", "deforme"), p("critique", "couvert")])).toBe("insuffisant");
  });
});

describe("resumeRaisonnement", () => {
  it("compte les points de raisonnement couverts", () => {
    expect(
      resumeRaisonnement([p("important", "couvert", true), p("important", "manquant", true), p("critique", "couvert")]),
    ).toEqual({ couverts: 1, total: 2 });
  });
});
