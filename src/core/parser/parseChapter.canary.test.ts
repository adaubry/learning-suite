// Canaris @canary du Bloc 2.1 (PLAN.md Phase 2) sur les vrais exports Google Docs.
// Intouchable sans autorisation humaine explicite (AGENTS.md §2.5).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseChapter } from "./parseChapter";
import { computeContentHash } from "./contentHash";
import { validateDocument } from "./validateDocument";

const fixturesDir = join(__dirname, "../../../e2e/evals/fixtures");

// NB : PLAN.md Bloc 2.1 prévoit 3 vrais exports ; seuls 2 existent au moment de ce bloc
// (DECISIONS.md). Le 3e s'ajoute ici quand il existe.
const fixtures = ["Introduction obli.md", "Introduction contrat.md"].map((name) => ({
  name,
  markdown: readFileSync(join(fixturesDir, name), "utf8"),
}));

describe("@canary round-trip parseur sur les vrais chapitres", () => {
  it.each(fixtures)("$name : parse sans jeter, hiérarchie de titres non vide", ({ markdown }) => {
    const parsed = parseChapter(markdown);
    expect(parsed.titleTree.length).toBeGreaterThan(0);
  });

  it.each(fixtures)(
    "$name : le hash est stable (remark-stringify round-trip idempotent)",
    ({ markdown }) => {
      const once = computeContentHash(markdown);
      const twice = computeContentHash(markdown);
      expect(once).toBe(twice);
    },
  );

  it("deux exports identiques donnent le même hash", () => {
    const [a, b] = fixtures;
    expect(computeContentHash(a.markdown)).not.toBe(computeContentHash(b.markdown));
    expect(computeContentHash(a.markdown)).toBe(computeContentHash(a.markdown.slice()));
  });
});

describe("@canary hiérarchie orpheline détectée", () => {
  it("un saut de niveau (Titre 4 sous Titre 2) est signalé, jamais corrigé", () => {
    const markdown = "# Chapitre\n\n## Partie\n\n#### Sous-section orpheline\n\nTexte.\n";
    const anomalies = validateDocument(parseChapter(markdown), markdown);
    expect(anomalies.some((a) => a.type === "hierarchie_non_descendante")).toBe(true);
  });

  it.each(fixtures)("$name : aucun saut de niveau dans les vrais chapitres", ({ markdown }) => {
    const anomalies = validateDocument(parseChapter(markdown), markdown);
    expect(anomalies.filter((a) => a.type === "hierarchie_non_descendante")).toHaveLength(0);
  });
});
