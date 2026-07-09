import { describe, expect, it } from "vitest";
import { computeFeynmanVerdict } from "./computeFeynmanVerdict";

// @canary PLAN Phase 7 : « bilan verdict acquis ⇒ tous les points critiques
// marqués démontrés » (cohérence interne du schéma).

describe("computeFeynmanVerdict", () => {
  it("acquis quand tous les points critiques sont démontrés", () => {
    const verdict = computeFeynmanVerdict([
      { type: "critique", statut: "demontre" },
      { type: "important", statut: "recite" },
      { type: "secondaire", statut: "non_aborde" },
    ]);
    expect(verdict).toBe("acquis");
  });

  it("insuffisant si un point critique est seulement récité (pas démontré)", () => {
    const verdict = computeFeynmanVerdict([
      { type: "critique", statut: "recite" },
      { type: "important", statut: "demontre" },
    ]);
    expect(verdict).toBe("insuffisant");
  });

  it("insuffisant si un point critique n'est pas abordé", () => {
    const verdict = computeFeynmanVerdict([{ type: "critique", statut: "non_aborde" }]);
    expect(verdict).toBe("insuffisant");
  });

  it("un point non-critique récité ou non abordé n'affecte pas le verdict", () => {
    const verdict = computeFeynmanVerdict([
      { type: "critique", statut: "demontre" },
      { type: "important", statut: "non_aborde" },
      { type: "secondaire", statut: "non_aborde" },
    ]);
    expect(verdict).toBe("acquis");
  });
});
