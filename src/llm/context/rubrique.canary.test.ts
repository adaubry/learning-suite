import { describe, expect, it } from "vitest";
import { buildRubriqueContext } from "./rubrique";

// @canary L0/L2 : le ContextBuilder n'envoie ni plus ni moins que le contrat
// ARCHITECTURE §9 ligne 2 — les ids/statuts/positions des lignes DB brutes ne
// doivent jamais fuiter vers le LLM.

const EXPECTED_KEYS = [
  "matiere",
  "chapitre",
  "titreSection",
  "contenu",
  "segmentsGras",
  "commentaires",
  "erreursActives",
].sort();

describe("buildRubriqueContext", () => {
  it("n'expose exactement que les clés du contrat", () => {
    const context = buildRubriqueContext({
      section: {
        titre: "Titre",
        contenu: "Contenu.",
        segmentsGras: [{ text: "important", start: 0, end: 9, ambiguous: false }],
        commentaires: [{ text: "note perso", start: 10, end: 20, ambiguous: false }],
      },
      matiere: "Droit civil",
      chapitre: "Chapitre 1",
      erreursActives: [{ type: "confusion", description: "x" }],
    });

    expect(Object.keys(context).sort()).toEqual(EXPECTED_KEYS);
  });

  it("ne laisse fuiter ni les positions ni les métadonnées internes des segments/erreurs", () => {
    const erreurBrute = { id: "err-1", sectionId: "sec-1", type: "confusion", description: "x", statut: "active" };
    const context = buildRubriqueContext({
      section: {
        titre: "Titre",
        contenu: "Contenu.",
        segmentsGras: [{ text: "important", start: 0, end: 9, ambiguous: false }],
        commentaires: [],
      },
      matiere: "Droit civil",
      chapitre: "Chapitre 1",
      erreursActives: [erreurBrute],
    });

    expect(context.segmentsGras).toEqual(["important"]);
    expect(context.erreursActives).toEqual([{ type: "confusion", description: "x" }]);
  });
});
