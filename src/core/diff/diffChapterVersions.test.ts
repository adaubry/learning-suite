import { describe, expect, it } from "vitest";
import { parseChapter } from "@/core/parser/parseChapter";
import { diffChapterVersions } from "./diffChapterVersions";

// Contenu réel (extraits de e2e/evals/fixtures/Introduction obli.md) — même doctrine que
// matchSections.test.ts (AGENTS.md : pas de faux cours de droit inventé).

function section(titre: string, corps: string): string {
  return `## ${titre}\n\n${corps}`;
}

const SOURCES = section("Sources du droit des obligations", "À ne pas confondre avec les sources des obligations elles-mêmes.");
const NOTION = section(
  "Notion d'obligation",
  "L'obligation au sens juridique repose sur une relation entre d'un côté le créancier et de l'autre le débiteur.",
);
const EFFET_RELATIF = section(
  "L'effet relatif du contrat",
  "Le contrat ne produit d'effet qu'entre les parties qui l'ont conclu, sauf exceptions prévues par la loi.",
);

function diff(ancien: string, nouveau: string) {
  return diffChapterVersions(ancien, parseChapter(ancien).titleTree, nouveau, parseChapter(nouveau).titleTree);
}

describe("diffChapterVersions", () => {
  it("contenu identique ⇒ tous les segments inchangés", () => {
    const markdown = `# Introduction\n\n${SOURCES}\n\n${NOTION}`;
    const segments = diff(markdown, markdown);
    expect(segments.every((s) => s.type === "inchange")).toBe(true);
    expect(segments).toHaveLength(2);
  });

  it("section ajoutée ⇒ un segment 'ajoute', le reste inchangé", () => {
    const ancien = `# Introduction\n\n${SOURCES}`;
    const nouveau = `# Introduction\n\n${SOURCES}\n\n${EFFET_RELATIF}`;
    const segments = diff(ancien, nouveau);

    expect(segments.find((s) => s.titre === "Sources du droit des obligations")?.type).toBe("inchange");
    const ajoutee = segments.find((s) => s.titre === "L'effet relatif du contrat");
    expect(ajoutee?.type).toBe("ajoute");
    expect(ajoutee?.nouveauContenu).toContain("Le contrat ne produit d'effet");
  });

  it("section supprimée ⇒ un segment 'supprime', le reste inchangé", () => {
    const ancien = `# Introduction\n\n${SOURCES}\n\n${NOTION}`;
    const nouveau = `# Introduction\n\n${SOURCES}`;
    const segments = diff(ancien, nouveau);

    expect(segments.find((s) => s.titre === "Sources du droit des obligations")?.type).toBe("inchange");
    const supprimee = segments.find((s) => s.titre === "Notion d'obligation");
    expect(supprimee?.type).toBe("supprime");
    expect(supprimee?.ancienContenu).toContain("le créancier");
  });

  it("contenu retouché, titre identique ⇒ 'modifie' avec diff mot-à-mot", () => {
    const ancien = `# Introduction\n\n${NOTION}`;
    const nouveauCorps = section(
      "Notion d'obligation",
      "L'obligation au sens juridique repose sur une relation entre le créancier et le débiteur.",
    );
    const nouveau = `# Introduction\n\n${nouveauCorps}`;
    const segments = diff(ancien, nouveau);

    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe("modifie");
    expect(segments[0].mots?.some((m) => m.removed)).toBe(true);
  });

  it("insertion en tête ⇒ ne fait pas dériver le diff sur le reste du document (pas de 'modifie' en cascade)", () => {
    const ancien = `# Introduction\n\n${SOURCES}\n\n${NOTION}`;
    const nouveau = `# Introduction\n\n${EFFET_RELATIF}\n\n${SOURCES}\n\n${NOTION}`;
    const segments = diff(ancien, nouveau);

    expect(segments.find((s) => s.titre === "L'effet relatif du contrat")?.type).toBe("ajoute");
    expect(segments.find((s) => s.titre === "Sources du droit des obligations")?.type).toBe("inchange");
    expect(segments.find((s) => s.titre === "Notion d'obligation")?.type).toBe("inchange");
  });

  it("titres dupliqués ⇒ appariés dans l'ordre d'apparition, pas de collision", () => {
    const doublon = section("Notion d'obligation", "Premier passage du même intitulé.");
    const doublon2 = section("Notion d'obligation", "Second passage du même intitulé.");
    const ancien = `# Introduction\n\n${doublon}\n\n${doublon2}`;
    const nouveauDoublon2 = section("Notion d'obligation", "Second passage, reformulé.");
    const nouveau = `# Introduction\n\n${doublon}\n\n${nouveauDoublon2}`;
    const segments = diff(ancien, nouveau);

    expect(segments).toHaveLength(2);
    expect(segments[0].type).toBe("inchange");
    expect(segments[1].type).toBe("modifie");
  });
});
