import { describe, expect, it } from "vitest";
import { buildFeynmanTurnContext } from "./feynmanTurn";

// @canary L0/L4 : le ContextBuilder n'envoie ni plus ni moins que le contrat
// ARCHITECTURE §9 ligne 5 — pas d'id de point/erreur/rubrique qui fuite.

// REVAMP v2 (2026-07-15) ajoute `brouillon` au contrat : contexte élargi, pas un
// canary anti-hallucination gelé — mis à jour ici avec le reste de l'étape.
const EXPECTED_KEYS = ["points", "contenuSection", "erreursActives", "historique", "dernierTranscript", "brouillon"].sort();

describe("buildFeynmanTurnContext", () => {
  it("n'expose exactement que les clés du contrat", () => {
    const context = buildFeynmanTurnContext({
      points: [{ intitule: "Point", attendu: "Attendu", type: "critique", piege_associe: null, segments_couverts: [] }],
      contenuSection: "Contenu complet.",
      erreursActives: [{ type: "confusion", description: "x" }],
      historique: [{ role: "ia", texte: "Explique la notion." }],
      dernierTranscript: "Voici mon explication.",
      brouillon: "Mon brouillon de blurting.",
    });

    expect(Object.keys(context).sort()).toEqual(EXPECTED_KEYS);
  });

  it("ne laisse fuiter ni id ni métadonnées internes des points/erreurs/tours", () => {
    const pointBrut = {
      intitule: "Point",
      attendu: "Attendu",
      type: "critique" as const,
      piege_associe: "Piège",
      segments_couverts: [],
    };
    const erreurBrute = { id: "err-1", sectionId: "sec-1", type: "confusion", description: "x", statut: "active" };
    const context = buildFeynmanTurnContext({
      points: [pointBrut],
      contenuSection: "Contenu.",
      erreursActives: [erreurBrute],
      historique: [],
      dernierTranscript: "…",
      brouillon: "Brouillon.",
    });

    expect(context.points).toEqual([{ intitule: "Point", attendu: "Attendu", piegeAssocie: "Piège" }]);
    expect(context.erreursActives).toEqual([{ type: "confusion", description: "x" }]);
  });
});
