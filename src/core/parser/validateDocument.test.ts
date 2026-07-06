import { describe, expect, it } from "vitest";
import { parseChapter } from "./parseChapter";
import { validateDocument } from "./validateDocument";

describe("validateDocument", () => {
  it("signale un saut de niveau (Titre 4 directement sous un Titre 2)", () => {
    const markdown = "# Chapitre\n\n## Grande partie\n\n#### Sous-section orpheline\n\nTexte.\n";
    const anomalies = validateDocument(parseChapter(markdown), markdown);

    expect(anomalies).toContainEqual(
      expect.objectContaining({ type: "hierarchie_non_descendante" }),
    );
  });

  it("ne signale rien quand la hiérarchie descend normalement", () => {
    const markdown = "# Chapitre\n\n## Partie\n\n### Section\n\nTexte.\n";
    const anomalies = validateDocument(parseChapter(markdown), markdown);

    expect(anomalies.filter((a) => a.type === "hierarchie_non_descendante")).toHaveLength(0);
  });

  it("signale ***gras et italique*** comme ambigu", () => {
    const markdown = "Un élément ***gras et italique*** ambigu.\n";
    const anomalies = validateDocument(parseChapter(markdown), markdown);

    expect(anomalies).toContainEqual(
      expect.objectContaining({ type: "gras_italique_ambigu" }),
    );
  });

  it("signale une balise HTML brute comme markdown mal formé", () => {
    const markdown = "# Chapitre\n\n<div>bloc html brut</div>\n\nTexte normal.\n";
    const anomalies = validateDocument(parseChapter(markdown), markdown);

    expect(anomalies).toContainEqual(
      expect.objectContaining({ type: "markdown_mal_forme" }),
    );
  });

  it("ne renvoie aucune anomalie pour un chapitre conforme", () => {
    const markdown = "# Chapitre\n\n## Partie\n\n**Point important.**\n\n*commentaire*\n";
    expect(validateDocument(parseChapter(markdown), markdown)).toHaveLength(0);
  });
});
