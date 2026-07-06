import { describe, expect, it } from "vitest";
import { validateGrasCoverage } from "./validateGuideOutput";
import type { GuideOutput } from "@/llm/schemas/guide";

// @canary FUNCTIONS §2 L2 / PLAN Phase 4 : chaque segment gras couvert par ≥ 1 point.
// Numérotation 1-based (rubrique.v1.md numérote les segments gras à partir de 1).

const point = (segments_couverts: number[]) =>
  ({ type: "critique", intitule: "x", attendu: "y", segments_couverts }) as GuideOutput["points"][number];

describe("validateGrasCoverage", () => {
  it("accepte quand tous les segments gras sont couverts", () => {
    const output: GuideOutput = { points: [point([1, 2]), point([3])] };
    expect(validateGrasCoverage(output, 3)).toBeNull();
  });

  it("rejette avec les numéros manquants quand un segment gras n'est couvert par aucun point", () => {
    const output: GuideOutput = { points: [point([1])] };
    const error = validateGrasCoverage(output, 3);
    expect(error).toContain("2");
    expect(error).toContain("3");
  });

  it("accepte trivialement quand la section n'a aucun segment gras", () => {
    const output: GuideOutput = { points: [point([])] };
    expect(validateGrasCoverage(output, 0)).toBeNull();
  });
});
