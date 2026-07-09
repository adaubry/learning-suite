import { describe, expect, it } from "vitest";
import { validateFeynmanBilanOutput } from "./validateFeynmanBilanOutput";

// @canary L5 : un point de rubrique omis dans le bilan n'est jamais traité comme
// implicitement "démontré" — même garantie que L3/validateCorrectionOutput.

describe("validateFeynmanBilanOutput", () => {
  it("accepte une couverture complète et unique", () => {
    const output = {
      points: [
        { point_index: 1, statut: "demontre" as const, commentaire: "ok" },
        { point_index: 2, statut: "recite" as const, commentaire: "ok" },
      ],
      points_solides: [],
      lacunes: [],
    };
    expect(validateFeynmanBilanOutput(output, 2)).toBeNull();
  });

  it("rejette un point de rubrique omis", () => {
    const output = {
      points: [{ point_index: 1, statut: "demontre" as const, commentaire: "ok" }],
      points_solides: [],
      lacunes: [],
    };
    expect(validateFeynmanBilanOutput(output, 2)).toMatch(/absents du bilan/);
  });

  it("rejette un point_index hors bornes", () => {
    const output = {
      points: [{ point_index: 5, statut: "demontre" as const, commentaire: "ok" }],
      points_solides: [],
      lacunes: [],
    };
    expect(validateFeynmanBilanOutput(output, 2)).toMatch(/hors bornes/);
  });

  it("rejette un point_index dupliqué", () => {
    const output = {
      points: [
        { point_index: 1, statut: "demontre" as const, commentaire: "ok" },
        { point_index: 1, statut: "recite" as const, commentaire: "ok" },
      ],
      points_solides: [],
      lacunes: [],
    };
    expect(validateFeynmanBilanOutput(output, 1)).toMatch(/double/);
  });
});
