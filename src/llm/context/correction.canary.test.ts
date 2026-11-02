import { describe, expect, it } from "vitest";
import { buildCorrectionContext } from "./correction";

// @canary : le ContextBuilder n'envoie ni plus ni moins que le contrat
// (ARCHITECTURE.md v2 §7) — aucun id ni statut brut de la base.

const EXPECTED_KEYS = ["points", "blurting", "tentative", "erreursActives"].sort();

describe("buildCorrectionContext (@canary)", () => {
  it("n'expose exactement que les clés du contrat", () => {
    const context = buildCorrectionContext({
      points: [{ type: "critique", raisonnement: false, etiquette: "Thèse", intitule: "Thèse", attendu: "La thèse." }],
      blurting: "Mon blurting.",
      tentative: 1,
      erreursActives: [{ id: "err-1", type: "confusion", description: "x" }],
    });

    expect(Object.keys(context).sort()).toEqual(EXPECTED_KEYS);
  });

  it("garde type, raisonnement, intitulé et attendu des points ; jamais d'id ni de statut", () => {
    const context = buildCorrectionContext({
      points: [{ type: "important", raisonnement: true, etiquette: "Cause", intitule: "Cause — X", attendu: "Parce que." }],
      blurting: "Mon blurting.",
      tentative: 2,
      erreursActives: [{ id: "err-1", type: "confusion", description: "x", statut: "active" } as never],
    });

    expect(context.points).toEqual([
      { type: "important", raisonnement: true, intitule: "Cause — X", attendu: "Parce que." },
    ]);
    expect(context.erreursActives).toEqual([{ type: "confusion", description: "x" }]);
    expect(JSON.stringify(context)).not.toMatch(/"id"|"statut"/);
  });
});
