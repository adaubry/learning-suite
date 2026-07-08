import { describe, expect, it } from "vitest";
import { presentCorrection } from "./presentCorrection";

// @canary ARCHITECTURE §5/§7, USER_FLOW É3.2 : tant qu'un nouvel essai est
// attendu, ni le contenu attendu NI l'explication du LLM ne doivent transiter —
// l'explication seule peut divulguer la réponse (« vous avez oublié que la loi
// est la 3e source »). Test au niveau de l'objet sérialisé (ce qui partirait sur
// le réseau), pas du rendu : un `JSON.stringify` de la réponse ne doit contenir
// aucune des chaînes secrètes.

const SECRET_ATTENDU = "SECRET_ATTENDU_le-code-civil-art-1103";
const SECRET_EXPLICATION = "SECRET_EXPLICATION_vous-avez-oublie-la-loi";
const SECRET_DESCRIPTION_ERREUR = "SECRET_ERREUR_la-bonne-reponse-etait-la-loi";

describe("presentCorrection · non-divulgation (canary)", () => {
  it("aucune chaîne secrète (attendu, explication, description d'erreur) dans la réponse sérialisée en divulgation contrôlée", () => {
    const result = presentCorrection(
      {
        diff: [
          { intitule: "Point critique", type: "critique", statut: "manquant", attendu: SECRET_ATTENDU, explication: SECRET_EXPLICATION },
          { intitule: "Point déformé", type: "important", statut: "deforme", attendu: SECRET_ATTENDU, explication: SECRET_EXPLICATION },
        ],
        erreursCandidates: [
          { type: "confusion", description: SECRET_DESCRIPTION_ERREUR, idErreurExistante: null },
        ],
      },
      { verdict: "insuffisant", retryAttendu: true },
    );

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(SECRET_ATTENDU);
    expect(serialized).not.toContain(SECRET_EXPLICATION);
    expect(serialized).not.toContain(SECRET_DESCRIPTION_ERREUR);
    expect(serialized).not.toContain("attendu");
    expect(serialized).not.toContain("explication");
    expect(serialized).not.toContain("description");
  });

  it("les mêmes chaînes apparaissent bien en divulgation complète (le test précédent teste le bon mécanisme)", () => {
    const result = presentCorrection(
      {
        diff: [
          { intitule: "Point critique", type: "critique", statut: "manquant", attendu: SECRET_ATTENDU, explication: SECRET_EXPLICATION },
        ],
        erreursCandidates: [
          { type: "confusion", description: SECRET_DESCRIPTION_ERREUR, idErreurExistante: null },
        ],
      },
      { verdict: "insuffisant", retryAttendu: false },
    );

    const serialized = JSON.stringify(result);
    expect(serialized).toContain(SECRET_ATTENDU);
    expect(serialized).toContain(SECRET_EXPLICATION);
    expect(serialized).toContain(SECRET_DESCRIPTION_ERREUR);
  });
});
