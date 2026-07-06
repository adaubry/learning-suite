import { describe, expect, it } from "vitest";
import { parseChapter } from "./parseChapter";

describe("parseChapter", () => {
  it("construit l'arbre des titres avec bornes, sans sauter les niveaux intermédiaires", () => {
    const markdown = `# Introduction\n\n## Présentation\n\nTexte.\n\n### Les sources\n\nAutre texte.\n`;
    const { titleTree } = parseChapter(markdown);

    expect(titleTree).toHaveLength(1);
    expect(titleTree[0]).toMatchObject({ level: 1, text: "Introduction" });
    expect(titleTree[0].children).toHaveLength(1);
    expect(titleTree[0].children[0]).toMatchObject({ level: 2, text: "Présentation" });
    expect(titleTree[0].children[0].children[0]).toMatchObject({ level: 3, text: "Les sources" });
    expect(titleTree[0].end).toBe(markdown.length);
  });

  it("respecte l'exemple valide de FORMAT §7 : groupement du gras, italique hors source de vérité", () => {
    const markdown = [
      "# Introduction",
      "",
      "## Présentation",
      "",
      "La première partie sera consacrée au contrat. Mais ensuite, **le code va",
      "réglementer certains contrats particuliers, appelés les contrats spéciaux**.",
      "",
      "### Les sources de l'obligation",
      "",
      "**L'article 1100 alinéa 1er identifie trois sources différentes",
      "d'obligations : les actes juridiques, les faits juridiques et la loi.**",
      "",
      "**L'alinéa 2 mentionne également les obligations naturelles.**",
      "",
      "",
      "**La créance figure à l'actif du patrimoine, la dette au passif.**",
      "",
      "_à revoir : j'ai confondu obligation naturelle et obligation civile au TD 2_",
      "",
      "Exemples d'application :",
      "",
      "- En droit des assurances ;",
      "- La théorie de la concurrence déloyale (application de la responsabilité",
      "  pour faute) ;",
      "- Dans le code de la route : l'obligation de rouler à droite.",
      "",
    ].join("\n");

    const { boldSegments, italicSegments } = parseChapter(markdown);

    // segment inline (dans un paragraphe mixte) : indépendant
    expect(boldSegments[0].text).toBe(
      "le code va\nréglementer certains contrats particuliers, appelés les contrats spéciaux",
    );

    // deux paragraphes entièrement gras séparés par une ligne vide -> un seul segment fusionné
    expect(boldSegments[1].text).toBe(
      "L'article 1100 alinéa 1er identifie trois sources différentes\nd'obligations : les actes juridiques, les faits juridiques et la loi.\n\nL'alinéa 2 mentionne également les obligations naturelles.",
    );

    // séparé par deux lignes vides du groupe précédent -> segment indépendant
    expect(boldSegments[2].text).toBe(
      "La créance figure à l'actif du patrimoine, la dette au passif.",
    );
    expect(boldSegments).toHaveLength(3);

    // italique : commentaire étudiant, un seul segment
    expect(italicSegments).toHaveLength(1);
    expect(italicSegments[0].text).toBe(
      "à revoir : j'ai confondu obligation naturelle et obligation civile au TD 2",
    );
  });

  it("traite ***gras et italique*** comme du gras, marqué ambigu (FORMAT §2.5)", () => {
    const markdown = "Un élément ***gras et italique*** ambigu.\n";
    const { boldSegments, italicSegments } = parseChapter(markdown);

    expect(italicSegments).toHaveLength(0);
    expect(boldSegments).toHaveLength(1);
    expect(boldSegments[0]).toMatchObject({ text: "gras et italique", ambiguous: true });
  });

  it("ignore le gras porté par un titre (les titres n'ont pas de sémantique gras/italique)", () => {
    const markdown = "# Chapitre\n\n### **Titre en gras**\n\nTexte normal.\n";
    const { titleTree, boldSegments } = parseChapter(markdown);

    expect(titleTree[0].children[0]).toMatchObject({ level: 3, text: "Titre en gras" });
    expect(boldSegments).toHaveLength(0);
  });

  it("traite le gras/italique dans une liste comme un segment inline indépendant, sans fusion", () => {
    const markdown = ["**Un point important :**", "", "* **Premier item**", "* **Second item**", ""].join(
      "\n",
    );
    const { boldSegments } = parseChapter(markdown);

    // le paragraphe d'intro + les deux items sont trois segments indépendants (la liste n'est
    // pas un paragraphe, donc hors de la règle de groupement §2.4 qui ne concerne que les
    // paragraphes consécutifs).
    expect(boldSegments.map((s) => s.text)).toEqual([
      "Un point important :",
      "Premier item",
      "Second item",
    ]);
  });
});
