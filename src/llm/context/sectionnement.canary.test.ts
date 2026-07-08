import { describe, expect, it } from "vitest";
import { parseChapter } from "@/core/parser/parseChapter";
import { selectCandidateHeadings } from "@/core/sectioning/candidateHeadings";
import { buildSectionnementContext } from "./sectionnement";

// @canary ARCHITECTURE §9 ligne 1 : le contexte Sectionnement n'envoie ni plus ni
// moins que le contrat (plan, contenu sans italiques, méthodologie, métadonnées).

describe("buildSectionnementContext", () => {
  it("n'expose exactement que les clés du contrat", () => {
    const md = "# Chapitre\n\n## Un\n\ntexte _commentaire_ suite\n";
    const { titleTree, italicSegments } = parseChapter(md);

    const context = buildSectionnementContext({
      markdown: md,
      italicSegments,
      candidates: selectCandidateHeadings(titleTree),
      matiere: "Droit civil",
      chapitre: "Chapitre 1",
      methodologieTitres: "Titre 1 = grande division...",
    });

    expect(Object.keys(context).sort()).toEqual(
      ["chapitre", "contenu", "matiere", "methodologieTitres", "plan"].sort(),
    );
    expect(context.contenu).not.toContain("commentaire");
  });
});
