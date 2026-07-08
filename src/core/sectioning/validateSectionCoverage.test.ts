import { describe, expect, it } from "vitest";
import type { SectionnementOutput } from "@/llm/schemas/sectionnement";
import { validateSectionCoverage } from "./validateSectionCoverage";

function output(sections: { debut_index: number; fin_index: number }[]): SectionnementOutput {
  return {
    sections: sections.map((s) => ({ ...s, titre_labelise: "x", justification: "y" })),
  };
}

describe("validateSectionCoverage", () => {
  it("accepte une partition complète et ordonnée", () => {
    const result = validateSectionCoverage(output([{ debut_index: 1, fin_index: 2 }, { debut_index: 3, fin_index: 3 }]), 3);
    expect(result).toBeNull();
  });

  it("rejette un trou dans la couverture", () => {
    const result = validateSectionCoverage(output([{ debut_index: 1, fin_index: 1 }, { debut_index: 3, fin_index: 3 }]), 3);
    expect(result).toMatch(/trou ou chevauchement/);
  });

  it("rejette un chevauchement", () => {
    const result = validateSectionCoverage(output([{ debut_index: 1, fin_index: 2 }, { debut_index: 2, fin_index: 3 }]), 3);
    expect(result).toMatch(/trou ou chevauchement/);
  });

  it("rejette une couverture qui ne va pas jusqu'au bout", () => {
    const result = validateSectionCoverage(output([{ debut_index: 1, fin_index: 2 }]), 3);
    expect(result).toMatch(/incomplète/);
  });

  it("rejette une section dont la fin précède le début", () => {
    const result = validateSectionCoverage(output([{ debut_index: 2, fin_index: 1 }]), 3);
    expect(result).toMatch(/debut_index/);
  });
});
