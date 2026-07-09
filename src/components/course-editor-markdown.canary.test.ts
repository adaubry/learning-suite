import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Node } from "unist";
import { computeContentHash } from "@/core/parser/contentHash";
import { markdownToTiptapDoc, tiptapDocToMarkdown } from "./course-editor-markdown";

// Canari du Bloc 8.3 (PLAN.md, TECH_MAPPING §5 point 4) : round-trip doc → éditeur → doc,
// posé AVANT l'intégration à l'écran, aucune dépendance à @tiptap/* ici.
//
// Deux invariants, pas un seul « hash identique » : une liste markdown « spread » (item·s
// séparés par une ligne vide) et une liste « tight » (sans ligne vide) sont l'AST — et donc le
// SENS — même chose (mdast ne change QUE le rendu HTML des paragraphes internes, jamais le
// texte) ; aucune extension Tiptap/ProseMirror ne modélise cette distinction purement
// syntaxique (confirmé en inspectant les deux fixtures réelles : la première réécriture
// aplatit les listes "spread" en "tight", ce qu'un vrai éditeur ferait de toute façon dès le
// premier chargement). Le hash-identique-à-l'original n'est donc PAS le bon invariant pour ce
// cas précis — testé à la place : (1) stabilité après la 1ère réécriture (point fixe, aucune
// dérive supplémentaire) et (2) tout le texte significatif survit mot pour mot.

const fixturesDir = join(process.cwd(), "e2e/evals/fixtures");
const fixtures = readdirSync(fixturesDir)
  .filter((f) => f.endsWith(".md"))
  .map((f) => ({ name: f, markdown: readFileSync(join(fixturesDir, f), "utf8") }));

const textProcessor = unified().use(remarkParse);

function plainText(markdown: string): string {
  const words: string[] = [];
  const visit = (node: Node & { value?: string; children?: Node[] }) => {
    if (node.type === "text" && typeof node.value === "string") words.push(node.value);
    for (const child of node.children ?? []) visit(child as typeof node);
  };
  visit(textProcessor.parse(markdown));
  return words.join(" ").replace(/\s+/g, " ").trim();
}

describe("course-editor-markdown @canary", () => {
  it.each(fixtures)("$name : aucun mot du cours perdu au round-trip", ({ markdown }) => {
    const roundTripped = tiptapDocToMarkdown(markdownToTiptapDoc(markdown));
    expect(plainText(roundTripped)).toBe(plainText(markdown));
  });

  it.each(fixtures)("$name : un second aller-retour est un point fixe (hash stable)", ({ markdown }) => {
    const once = tiptapDocToMarkdown(markdownToTiptapDoc(markdown));
    const twice = tiptapDocToMarkdown(markdownToTiptapDoc(once));
    expect(computeContentHash(twice)).toBe(computeContentHash(once));
  });
});
