import { describe, expect, it } from "vitest";
import { validateCorrectionOutput } from "./validateCorrectionOutput";
import type { CorrectionOutput } from "@/llm/schemas/correction";

// @canary FUNCTIONS §2 L3 / PLAN Bloc 5.1 : le diff couvre TOUS les points de la
// rubrique exactement une fois (un point omis n'est jamais silencieusement traité
// comme couvert) ; tout recidive_index référence une erreur active fournie.
// Numérotation 1-based (correction_erreurs.v1.md).

const diffPoint = (point_index: number, statut: CorrectionOutput["diff"][number]["statut"] = "couvert") =>
  ({ point_index, statut, explication: "x" }) as CorrectionOutput["diff"][number];

describe("validateCorrectionOutput", () => {
  it("accepte un diff qui couvre exactement tous les points, sans recidive", () => {
    const output: CorrectionOutput = { diff: [diffPoint(1), diffPoint(2)], erreurs_candidates: [] };
    expect(validateCorrectionOutput(output, 2, 0)).toBeNull();
  });

  it("rejette avec les numéros manquants quand un point de la rubrique est absent du diff", () => {
    const output: CorrectionOutput = { diff: [diffPoint(1)], erreurs_candidates: [] };
    const error = validateCorrectionOutput(output, 3, 0);
    expect(error).toContain("2");
    expect(error).toContain("3");
  });

  it("rejette un point_index hors bornes", () => {
    const output: CorrectionOutput = { diff: [diffPoint(1), diffPoint(5)], erreurs_candidates: [] };
    expect(validateCorrectionOutput(output, 2, 0)).toContain("hors bornes");
  });

  it("rejette un point_index dupliqué même si les bornes et la couverture semblent correctes", () => {
    const output: CorrectionOutput = { diff: [diffPoint(1), diffPoint(1)], erreurs_candidates: [] };
    expect(validateCorrectionOutput(output, 1, 0)).toContain("double");
  });

  it("rejette un recidive_index hors bornes des erreurs actives fournies", () => {
    const output: CorrectionOutput = {
      diff: [diffPoint(1)],
      erreurs_candidates: [{ type: "confusion", description: "x", recidive_index: 4 }],
    };
    expect(validateCorrectionOutput(output, 1, 2)).toContain("recidive_index");
  });

  it("accepte un recidive_index dans les bornes", () => {
    const output: CorrectionOutput = {
      diff: [diffPoint(1)],
      erreurs_candidates: [{ type: "confusion", description: "x", recidive_index: 2 }],
    };
    expect(validateCorrectionOutput(output, 1, 2)).toBeNull();
  });

  it("accepte une erreur candidate sans recidive_index (nouvelle erreur)", () => {
    const output: CorrectionOutput = {
      diff: [diffPoint(1)],
      erreurs_candidates: [{ type: "omission", description: "x", recidive_index: null }],
    };
    expect(validateCorrectionOutput(output, 1, 0)).toBeNull();
  });
});
