import { describe, expect, it } from "vitest";
import { parseChapter } from "@/core/parser/parseChapter";
import { mechanicalSectioning } from "./mechanicalSectioning";

describe("mechanicalSectioning", () => {
  it("une section par Titre 2", () => {
    const md = "# Chapitre\n\n## Un\n\ntexte un\n\n## Deux\n\ntexte deux\n";
    const { titleTree } = parseChapter(md);
    const sections = mechanicalSectioning(titleTree, md.length);
    expect(sections.map((s) => s.titre)).toEqual(["Un", "Deux"]);
    expect(sections[0].start).toBeLessThan(sections[1].start);
    expect(sections[sections.length - 1].end).toBe(md.length);
  });

  it("chapitre entier si aucun titre", () => {
    const md = "juste du texte, sans titre.\n";
    const { titleTree } = parseChapter(md);
    const sections = mechanicalSectioning(titleTree, md.length);
    expect(sections).toEqual([{ titre: "Chapitre entier", start: 0, end: md.length }]);
  });
});
