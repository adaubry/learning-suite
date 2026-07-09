import { describe, expect, it } from "vitest";
import { buildFeynmanBilanContext } from "./feynmanBilan";

// @canary L0/L5 : le ContextBuilder n'envoie ni plus ni moins que le contrat
// ARCHITECTURE §9 ligne 5 (bilan) — pas le contenu de section, pas d'id.

describe("buildFeynmanBilanContext", () => {
  it("n'expose exactement que points et historique", () => {
    const context = buildFeynmanBilanContext({
      points: [{ intitule: "Point", attendu: "Attendu", type: "critique", piege_associe: null, segments_couverts: [] }],
      historique: [{ role: "etudiant", texte: "Ma réponse." }],
    });

    expect(Object.keys(context).sort()).toEqual(["historique", "points"]);
  });

  it("ne laisse fuiter ni le type de point ni le piège associé", () => {
    const context = buildFeynmanBilanContext({
      points: [{ intitule: "Point", attendu: "Attendu", type: "critique", piege_associe: "Piège", segments_couverts: [] }],
      historique: [],
    });

    expect(context.points).toEqual([{ intitule: "Point", attendu: "Attendu" }]);
  });
});
