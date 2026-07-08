import { describe, expect, it } from "vitest";
import { buildCorrectionContext } from "./correction";

// @canary L0/L3 : le ContextBuilder n'envoie ni plus ni moins que le contrat
// ARCHITECTURE §9 ligne 3+4 — surtout PAS `section.contenu` (le cours), et aucun
// id/statut brut de la DB (points de rubrique, erreurs actives).

const EXPECTED_KEYS = ["points", "blurting", "tentative", "erreursActives"].sort();

describe("buildCorrectionContext", () => {
  it("n'expose exactement que les clés du contrat", () => {
    const context = buildCorrectionContext({
      points: [
        { type: "critique", intitule: "Def", attendu: "La définition.", segments_couverts: [1] },
      ],
      blurting: "Mon blurting.",
      tentative: 1,
      erreursActives: [{ id: "err-1", type: "confusion", description: "x" }],
    });

    expect(Object.keys(context).sort()).toEqual(EXPECTED_KEYS);
  });

  it("ne laisse fuiter ni le contenu du cours, ni les ids/statuts bruts, ni segments_couverts", () => {
    const context = buildCorrectionContext({
      points: [
        {
          type: "critique",
          intitule: "Def",
          attendu: "La définition.",
          piege_associe: "Confusion classique",
          segments_couverts: [1, 2],
        },
      ],
      blurting: "Mon blurting.",
      tentative: 2,
      erreursActives: [{ id: "err-1", type: "confusion", description: "x", statut: "active" } as never],
    });

    expect(context.points).toEqual([
      { intitule: "Def", attendu: "La définition.", piegeAssocie: "Confusion classique" },
    ]);
    expect(context.erreursActives).toEqual([{ type: "confusion", description: "x" }]);
    expect(JSON.stringify(context)).not.toMatch(/segments_couverts|"id"|"statut"/);
  });
});
