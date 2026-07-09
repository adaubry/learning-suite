import { describe, expect, it } from "vitest";
import { computeContentHash } from "@/core/parser/contentHash";
import { markdownToTiptapDoc, tiptapDocToMarkdown, type TiptapNode } from "./course-editor-markdown";

function roundTripHash(markdown: string): { orig: string; back: string } {
  const back = tiptapDocToMarkdown(markdownToTiptapDoc(markdown));
  return { orig: computeContentHash(markdown), back: computeContentHash(back) };
}

describe("markdownToTiptapDoc", () => {
  it("titre + gras + italique", () => {
    const doc = markdownToTiptapDoc("## Titre\n\n**important** et *commentaire*.");
    expect(doc).toEqual<TiptapNode>({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Titre" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "important", marks: [{ type: "bold" }] },
            { type: "text", text: " et " },
            { type: "text", text: "commentaire", marks: [{ type: "italic" }] },
            { type: "text", text: "." },
          ],
        },
      ],
    });
  });

  it("titres 1 à 6 fidèlement préservés (fidélité, pas la barre d'outils)", () => {
    const doc = markdownToTiptapDoc("###### Titre 6");
    expect(doc.content?.[0]).toEqual({ type: "heading", attrs: { level: 6 }, content: [{ type: "text", text: "Titre 6" }] });
  });

  it("lien : mark 'link' avec href, jamais un nœud séparé", () => {
    const doc = markdownToTiptapDoc("Voir [cet arrêt](https://legifrance.gouv.fr/x).");
    const p = doc.content?.[0];
    expect(p?.content).toEqual([
      { type: "text", text: "Voir " },
      { type: "text", text: "cet arrêt", marks: [{ type: "link", attrs: { href: "https://legifrance.gouv.fr/x" } }] },
      { type: "text", text: "." },
    ]);
  });

  it("liste à puces", () => {
    const doc = markdownToTiptapDoc("* Un\n* Deux");
    expect(doc.content?.[0]).toEqual({
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Un" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Deux" }] }] },
      ],
    });
  });

  it("construction non supportée (blockquote) ⇒ erreur explicite, jamais un silence", () => {
    expect(() => markdownToTiptapDoc("> Citation")).toThrow(/non supportée/);
  });
});

describe("course-editor-markdown — round-trip ciblé", () => {
  it("gras+italique+lien simples : hash identique", () => {
    const md = "## Titre\n\n**Important** et [un lien](https://example.com/) et *commentaire*.";
    const { orig, back } = roundTripHash(md);
    expect(back).toBe(orig);
  });

  it("liste tight (sans ligne vide) : hash identique", () => {
    const md = "* Un\n* Deux\n* Trois";
    const { orig, back } = roundTripHash(md);
    expect(back).toBe(orig);
  });
});
