import { describe, expect, it } from "vitest";
import { computeVerdict, type MergedDiffPoint } from "./verdict";

function point(overrides: Partial<MergedDiffPoint>): MergedDiffPoint {
  return {
    intitule: "Point",
    type: "important",
    statut: "couvert",
    attendu: "attendu",
    explication: "explication",
    ...overrides,
  };
}

describe("computeVerdict", () => {
  it("acquis si aucun point critique manquant ou déformé", () => {
    const diff = [point({ type: "critique", statut: "couvert" }), point({ type: "secondaire", statut: "manquant" })];
    expect(computeVerdict(diff)).toBe("acquis");
  });

  it("insuffisant si un point critique manquant", () => {
    const diff = [point({ type: "critique", statut: "manquant" })];
    expect(computeVerdict(diff)).toBe("insuffisant");
  });

  it("insuffisant si un point critique déformé (au moins aussi grave qu'absent)", () => {
    const diff = [point({ type: "critique", statut: "deforme" })];
    expect(computeVerdict(diff)).toBe("insuffisant");
  });

  it("acquis si seuls des points important/secondaire sont manquants", () => {
    const diff = [point({ type: "important", statut: "manquant" }), point({ type: "secondaire", statut: "deforme" })];
    expect(computeVerdict(diff)).toBe("acquis");
  });
});
