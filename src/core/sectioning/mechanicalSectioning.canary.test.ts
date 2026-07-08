import { describe, expect, it } from "vitest";
import { parseChapter } from "@/core/parser/parseChapter";
import { mechanicalSectioning } from "./mechanicalSectioning";

// @canary PLAN Phase 3 : P6 sur un chapitre sans Titre 2 doit retomber sur les
// Titre 1, jamais bloquer faute de sectionnement LLM.

describe("mechanicalSectioning · secours", () => {
  it("retombe sur les Titre 1 quand le chapitre n'a aucun Titre 2", () => {
    const md = "# Introduction\n\ntexte\n\n# Conclusion\n\ntexte\n";
    const { titleTree } = parseChapter(md);
    const sections = mechanicalSectioning(titleTree, md.length);
    expect(sections.map((s) => s.titre)).toEqual(["Introduction", "Conclusion"]);
  });
});
