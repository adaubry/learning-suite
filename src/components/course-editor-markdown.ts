// U4 CourseEditor — sérialisation Markdown ↔ Tiptap (TECH_MAPPING §5). « Reste maison » : ce
// document ne nomme aucune lib de sérialisation Markdown pour Tiptap, seulement « Tiptap +
// sérialisation Markdown » — même doctrine que P1/P3 (couche fine de projection au-dessus de
// remark, pas de réimplémentation du parseur). Markdown → mdast (remark-parse, déjà installé)
// → JSON Tiptap ; et l'inverse, JSON Tiptap → mdast → remark-stringify. Fonctions PURES, testables
// sans monter de vrai éditeur (aucun import `@tiptap/*` ici — le canari de round-trip peut
// tourner avant même d'installer le paquet, comme l'exige PLAN.md Bloc 8.3).
//
// Vocabulaire supporté : Titres 1–6 (FORMAT §2.1 ; le schéma Tiptap accepte les 6 niveaux pour
// ne jamais perdre un vrai chapitre déjà importé — seule la barre d'outils de l'éditeur limite
// la SAISIE à 1–3, TECH_MAPPING §5 point 1), gras (§2.2), italique (§2.3), retour à la ligne
// forcé, listes à puces ET numérotées (§2.6), et les **liens** — non documentés par FORMAT.md
// mais bien présents dans les deux fixtures réelles (citations de jurisprudence/légifrance) :
// découverts par le canari de round-trip lui-même, ajoutés pour ne pas perdre de contenu réel.
// Blockquote/table/image, tolérés par §2.6 mais absents des fixtures, ne sont volontairement pas
// supportés — un nœud non reconnu lève une erreur explicite plutôt que de perdre du contenu.

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkFrontmatter from "remark-frontmatter";
import type { Root, RootContent, Heading, Paragraph, List, ListItem, Link, Text as MdText } from "mdast";

const parser = unified().use(remarkParse).use(remarkFrontmatter);
const stringifier = unified().use(remarkStringify);

export type TiptapMark = { type: "bold" } | { type: "italic" } | { type: "link"; attrs: { href: string } };

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: TiptapMark[];
}

function unsupported(type: string): never {
  throw new Error(`Construction Markdown non supportée par l'éditeur : ${type}`);
}

function mapInline(nodes: RootContent[], marks: TiptapMark[] = []): TiptapNode[] {
  const out: TiptapNode[] = [];
  for (const node of nodes) {
    if (node.type === "text") {
      const text = (node as MdText).value;
      out.push(marks.length ? { type: "text", text, marks } : { type: "text", text });
    } else if (node.type === "strong") {
      out.push(...mapInline(node.children as RootContent[], [...marks, { type: "bold" }]));
    } else if (node.type === "emphasis") {
      out.push(...mapInline(node.children as RootContent[], [...marks, { type: "italic" }]));
    } else if (node.type === "link") {
      const l = node as Link;
      out.push(...mapInline(l.children as RootContent[], [...marks, { type: "link", attrs: { href: l.url } }]));
    } else if (node.type === "break") {
      out.push({ type: "hardBreak" });
    } else {
      unsupported(node.type);
    }
  }
  return out;
}

function mapListItem(item: ListItem): TiptapNode {
  return { type: "listItem", content: (item.children as RootContent[]).map(mapBlock) };
}

function mapBlock(node: RootContent): TiptapNode {
  if (node.type === "heading") {
    const h = node as Heading;
    const content = mapInline(h.children as RootContent[]);
    return { type: "heading", attrs: { level: h.depth }, ...(content.length ? { content } : {}) };
  }
  if (node.type === "paragraph") {
    const content = mapInline((node as Paragraph).children as RootContent[]);
    return content.length ? { type: "paragraph", content } : { type: "paragraph" };
  }
  if (node.type === "list") {
    const l = node as List;
    return {
      type: l.ordered ? "orderedList" : "bulletList",
      ...(l.ordered && l.start != null && l.start !== 1 ? { attrs: { start: l.start } } : {}),
      content: l.children.map((li) => mapListItem(li as ListItem)),
    };
  }
  return unsupported(node.type);
}

/** Markdown → document Tiptap (JSON ProseMirror). Chargement de l'éditeur. */
export function markdownToTiptapDoc(markdown: string): TiptapNode {
  const root = parser.parse(markdown) as Root;
  const content = root.children.filter((n) => n.type !== "yaml").map(mapBlock);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

function buildInline(nodes: TiptapNode[]): RootContent[] {
  const out: RootContent[] = [];
  for (const n of nodes) {
    if (n.type === "hardBreak") {
      out.push({ type: "break" } as RootContent);
      continue;
    }
    if (n.type !== "text") unsupported(n.type);
    let wrapped: RootContent = { type: "text", value: n.text ?? "" } as RootContent;
    const marks = n.marks ?? [];
    const link = marks.find((m): m is Extract<TiptapMark, { type: "link" }> => m.type === "link");
    // Ordre de ré-emballage arbitraire mais déterministe (lien au plus près du texte, italique,
    // puis gras à l'extérieur) — round-trip vérifié par hash normalisé (FORMAT §6.5), pas par
    // identité byte à byte.
    if (link) wrapped = { type: "link", url: link.attrs.href, children: [wrapped] } as RootContent;
    if (marks.some((m) => m.type === "italic")) wrapped = { type: "emphasis", children: [wrapped] } as RootContent;
    if (marks.some((m) => m.type === "bold")) wrapped = { type: "strong", children: [wrapped] } as RootContent;
    out.push(wrapped);
  }
  return out;
}

function buildListItem(item: TiptapNode): RootContent {
  return { type: "listItem", spread: false, children: (item.content ?? []).map(buildBlock) } as RootContent;
}

function buildBlock(node: TiptapNode): RootContent {
  if (node.type === "heading") {
    return {
      type: "heading",
      depth: (node.attrs?.level as 1 | 2 | 3 | 4 | 5 | 6) ?? 1,
      children: buildInline(node.content ?? []),
    } as RootContent;
  }
  if (node.type === "paragraph") {
    return { type: "paragraph", children: buildInline(node.content ?? []) } as RootContent;
  }
  if (node.type === "bulletList" || node.type === "orderedList") {
    return {
      type: "list",
      ordered: node.type === "orderedList",
      spread: false,
      ...(node.type === "orderedList" ? { start: (node.attrs?.start as number) ?? 1 } : {}),
      children: (node.content ?? []).map(buildListItem),
    } as RootContent;
  }
  return unsupported(node.type);
}

/** Document Tiptap (JSON ProseMirror) → Markdown. Sauvegarde depuis l'éditeur. */
export function tiptapDocToMarkdown(doc: TiptapNode): string {
  const root: Root = { type: "root", children: (doc.content ?? []).map(buildBlock) };
  return String(stringifier.stringify(root));
}
