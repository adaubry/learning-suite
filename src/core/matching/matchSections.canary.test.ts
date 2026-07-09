import { describe, expect, it } from "vitest";
import { parseChapter } from "@/core/parser/parseChapter";
import { mechanicalSectioning } from "@/core/sectioning/mechanicalSectioning";
import { matchSections, type OldSection } from "./matchSections";

// Canaris du Bloc 8.1 (PLAN.md Phase 8) — intouchables sans autorisation humaine explicite
// (AGENTS.md §2.5). Contenu réel repris de e2e/evals/fixtures/Introduction obli.md.

const NOTION_TITRE = "Notion d'obligation";
const NOTION_CORPS =
  "L'obligation au sens juridique repose sur une relation entre d'un côté le créancier et de l'autre le débiteur.";
const NOTION = `## ${NOTION_TITRE}\n\n${NOTION_CORPS}`;

const SOURCES_TITRE = "Sources du droit des obligations";
const SOURCES_CORPS = "À ne pas confondre avec les sources des obligations elles-mêmes.";
const SOURCES = `## ${SOURCES_TITRE}\n\n${SOURCES_CORPS}`;

function buildOldSections(markdown: string): OldSection[] {
  const { titleTree } = parseChapter(markdown);
  return mechanicalSectioning(titleTree, markdown.length).map((b, i) => ({
    id: `old-${i}`,
    titre: b.titre,
    ordre: i + 1,
    contenu: markdown.slice(b.start, b.end),
  }));
}

describe("matchSections @canary", () => {
  it("section au contenu identique ⇒ toujours intacte, y compris déplacée entre d'autres sections retouchées", () => {
    const markdownV1 = `# Introduction\n\n${SOURCES}\n\n${NOTION}`;
    const ancien = buildOldSections(markdownV1);

    // Autour de la section stable : une autre section renommée ET une nouvelle section ajoutée —
    // la section identique doit rester "intacte" quel que soit le bruit alentour.
    const sourcesRenommees = `## Les sources du droit des obligations\n\n${SOURCES_CORPS}`;
    const nouvelleSection = "## Conclusion\n\nSection ajoutée dans cette version.";
    const markdownV2 = `# Introduction\n\n${sourcesRenommees}\n\n${NOTION}\n\n${nouvelleSection}`;

    const { titleTree } = parseChapter(markdownV2);
    const result = matchSections(ancien, titleTree, markdownV2);

    const notionAncienne = ancien.find((s) => s.titre === NOTION_TITRE)!;
    const notionAppariee = result.appariements.find((m) => m.ancienneId === notionAncienne.id);
    expect(notionAppariee?.statut).toBe("intacte");
    expect(notionAppariee?.nouveauBloc.contenu.trim()).toBe(NOTION.trim());
  });

  it("en cas de doute ⇒ disparue + nouvelle, jamais un mauvais appariement", () => {
    const markdownV1 = `# Introduction\n\n${NOTION}`;
    const ancien = buildOldSections(markdownV1);

    // Titre sans le moindre mot commun ET contenu non identique : aucun signal fiable de
    // continuité. Le seuil conservateur interdit de la faire correspondre malgré tout.
    const remplacement = "## Conclusion\n\nParagraphe entièrement différent, sans rapport avec l'ancien contenu.";
    const markdownV2 = `# Introduction\n\n${remplacement}`;

    const { titleTree } = parseChapter(markdownV2);
    const result = matchSections(ancien, titleTree, markdownV2);

    expect(result.appariements).toHaveLength(0);
    expect(result.disparues).toEqual([{ ancienneId: ancien[0].id }]);
    expect(result.nouvelles).toHaveLength(1);
    expect(result.nouvelles[0].titre).toBe("Conclusion");
  });
});
