import { describe, expect, it } from "vitest";
import { extractPoints } from "./extractPoints";

describe("extractPoints", () => {
  it("thèse = premier paragraphe non étiqueté, critique", () => {
    const [these] = extractPoints("La thèse en une phrase.\n\n- **Constat :** x");
    expect(these).toMatchObject({ type: "critique", etiquette: "Thèse", attendu: "La thèse en une phrase." });
  });

  it("pas de thèse si la fiche commence par un sous-titre ou une étiquette", () => {
    expect(extractPoints("### Sous\n\nTexte libre.").map((p) => p.etiquette)).toEqual(["Paragraphe"]);
    expect(extractPoints("**Définition :** x").map((p) => p.etiquette)).toEqual(["Définition"]);
  });

  it("classe les étiquettes : critique / raisonnement / important / secondaire", () => {
    const points = extractPoints(
      [
        "Thèse.",
        "- **Définition :** d",
        "- **Texte :** t",
        "- **Cause :** c",
        "- **Conséquence :** q",
        "- **Logique :** l",
        "- **Constat :** k",
        "- **Piège :** p",
        "- **Lien :** n",
        "- **Inconnue :** u",
      ].join("\n"),
    );
    expect(points.map((p) => [p.etiquette, p.type, p.raisonnement])).toEqual([
      ["Thèse", "critique", false],
      ["Définition", "critique", false],
      ["Texte", "critique", false],
      ["Cause", "important", true],
      ["Conséquence", "important", true],
      ["Logique", "important", true],
      ["Constat", "important", false],
      ["Piège", "important", false],
      ["Lien", "secondaire", false],
      ["Inconnue", "important", false],
    ]);
  });

  it("n'exige jamais un complément hors cours", () => {
    const points = extractPoints("Thèse.\n\n- **Complément (hors cours) :** art. 13.\n- **Complement :** y");
    expect(points.map((p) => p.etiquette)).toEqual(["Thèse"]);
  });

  it("accepte les deux-points hors du gras et les espaces insécables", () => {
    expect(extractPoints("Thèse.\n\n**Cause** : x")[1]).toMatchObject({ etiquette: "Cause", attendu: "x" });
    expect(extractPoints("Thèse.\n\n- **Cause :** x")[1]).toMatchObject({ etiquette: "Cause", attendu: "x" });
  });

  it("un gras sans deux-points n'est pas une étiquette", () => {
    expect(extractPoints("Thèse.\n\n**Important** et la suite.")[1]).toMatchObject({
      etiquette: "Paragraphe",
      attendu: "Important et la suite.",
    });
  });

  it("un sous-titre vide ne remplace pas le sous-titre courant", () => {
    const points = extractPoints("Thèse.\n\n### Pourquoi\n\n### \n\n- **Cause :** x");
    expect(points[1].intitule).toBe("Cause — Pourquoi");
  });

  it("préfixe l'intitulé par le sous-titre courant", () => {
    const points = extractPoints("Thèse.\n\n### Pourquoi\n\n- **Cause :** x");
    expect(points[1].intitule).toBe("Cause — Pourquoi");
  });

  it("regroupe les puces non étiquetées consécutives en un point", () => {
    const points = extractPoints("Thèse.\n\n### Ce qu'elle crée\n\n- le préfet ;\n- les conseils ;\n- **Constat :** x");
    expect(points.slice(1).map((p) => [p.etiquette, p.attendu])).toEqual([
      ["Liste", "le préfet ; les conseils"],
      ["Constat", "x"],
    ]);
  });

  it("une ligne de tableau = un point, en-têtes en clé", () => {
    const points = extractPoints(
      "Thèse.\n\n| **Notion** | **Origine** |\n|---|---|\n| Bien commun | Aristote |\n| *Res publica* | Droit romain |",
    );
    expect(points.slice(1).map((p) => [p.intitule, p.attendu])).toEqual([
      ["Bien commun", "Notion : Bien commun ; Origine : Aristote"],
      ["Res publica", "Notion : Res publica ; Origine : Droit romain"],
    ]);
  });

  it("tableau comparatif (1ʳᵉ colonne sans en-tête) : libellé de ligne en intitulé", () => {
    const points = extractPoints("Thèse.\n\n| | **Retenue** | **Déléguée** |\n|---|---|---|\n| Période | 1799-1872 | Depuis 1872 |");
    expect(points[1]).toMatchObject({ intitule: "Période", attendu: "Retenue : 1799-1872 ; Déléguée : Depuis 1872" });
  });
});
