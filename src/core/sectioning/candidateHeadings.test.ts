import { describe, expect, it } from "vitest";
import { parseChapter } from "@/core/parser/parseChapter";
import { selectCandidateHeadings } from "./candidateHeadings";

describe("selectCandidateHeadings", () => {
  it("retient les Titre 2 quand ils existent", () => {
    const { titleTree } = parseChapter("# Chapitre\n\n## Un\n\ntexte\n\n## Deux\n\ntexte\n");
    const candidates = selectCandidateHeadings(titleTree);
    expect(candidates.map((n) => n.text)).toEqual(["Un", "Deux"]);
  });

  it("retombe sur les Titre 1 en l'absence de Titre 2", () => {
    const { titleTree } = parseChapter("# Un\n\ntexte\n\n# Deux\n\ntexte\n");
    const candidates = selectCandidateHeadings(titleTree);
    expect(candidates.map((n) => n.text)).toEqual(["Un", "Deux"]);
  });

  it("liste vide si aucun titre", () => {
    const { titleTree } = parseChapter("juste du texte, sans titre.\n");
    expect(selectCandidateHeadings(titleTree)).toEqual([]);
  });
});
