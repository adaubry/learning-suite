// P1 — parseChapter (FUNCTIONS.md §1, FORMAT.md §2 et §6).
// Markdown -> arbre des titres + segments gras/italiques, sur AST remark. Ne corrige jamais.

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import type { Root, RootContent, Paragraph, Strong, Emphasis, Heading } from "mdast";
import type { TitleNode, TitleLevel, EmphasisSegment, ParsedChapter } from "./types";

const processor = unified().use(remarkParse).use(remarkFrontmatter);

type Classification = "bold" | "italic";

function nodeText(node: RootContent): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  if ("children" in node && Array.isArray(node.children)) {
    return node.children.map((child) => nodeText(child as RootContent)).join("");
  }
  return "";
}

function offsets(node: RootContent): { start: number; end: number } {
  // remark-parse fournit toujours les offsets ; le type mdast les déclare optionnels par
  // prudence générique (unist), mais notre pipeline (remark-parse seul) les garantit.
  return { start: node.position!.start.offset!, end: node.position!.end.offset! };
}

// `***texte***` (FORMAT §2.5) : gras enveloppant un unique enfant italique (ou l'inverse) sur
// exactement le même texte -> ambigu, traité par défaut comme du gras.
function classify(node: Strong | Emphasis): { classification: Classification; ambiguous: boolean } {
  const only = node.children.length === 1 ? node.children[0] : undefined;
  const nested =
    (node.type === "strong" && only?.type === "emphasis") ||
    (node.type === "emphasis" && only?.type === "strong");
  if (nested) return { classification: "bold", ambiguous: true };
  return { classification: node.type === "strong" ? "bold" : "italic", ambiguous: false };
}

function buildTitleTree(root: Root, sourceLength: number): TitleNode[] {
  const roots: TitleNode[] = [];
  const stack: TitleNode[] = [];

  for (const child of root.children) {
    if (child.type !== "heading") continue;
    const heading = child as Heading;
    const { start } = offsets(heading);
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.depth) {
      stack.pop()!.end = start - 1;
    }
    const node: TitleNode = {
      level: heading.depth as TitleLevel,
      text: nodeText(heading),
      start,
      end: sourceLength,
      children: [],
    };
    (stack.length > 0 ? stack[stack.length - 1].children : roots).push(node);
    stack.push(node);
  }
  for (const remaining of stack) remaining.end = sourceLength;
  return roots;
}

interface Group {
  classification: Classification;
  ambiguous: boolean;
  paragraphs: Paragraph[];
}

function flushGroup(group: Group | undefined, bold: EmphasisSegment[], italic: EmphasisSegment[]) {
  if (!group) return;
  const first = group.paragraphs[0];
  const last = group.paragraphs[group.paragraphs.length - 1];
  const text = group.paragraphs.map((p) => nodeText(p.children[0] as RootContent)).join("\n\n");
  const segment: EmphasisSegment = {
    text,
    start: offsets(first).start,
    end: offsets(last).end,
    ambiguous: group.ambiguous,
  };
  (group.classification === "bold" ? bold : italic).push(segment);
}

// Une seule ligne vide entre deux paragraphes entièrement emphasés de même type -> même segment
// (FORMAT §2.4). Au moins deux lignes vides -> segments indépendants.
function blankLinesBetween(a: Paragraph, b: Paragraph): number {
  return b.position!.start.line - a.position!.end.line - 1;
}

function fullEmphasisChild(paragraph: Paragraph): Strong | Emphasis | undefined {
  if (paragraph.children.length !== 1) return undefined;
  const only = paragraph.children[0];
  return only.type === "strong" || only.type === "emphasis" ? only : undefined;
}

function walkInline(nodes: RootContent[], bold: EmphasisSegment[], italic: EmphasisSegment[]) {
  for (const node of nodes) {
    if (node.type === "strong" || node.type === "emphasis") {
      const { classification, ambiguous } = classify(node);
      const segment: EmphasisSegment = { text: nodeText(node), ...offsets(node), ambiguous };
      (classification === "bold" ? bold : italic).push(segment);
      continue; // un `***texte***` déjà classé ne redescend pas dans son enfant
    }
    if ("children" in node && Array.isArray(node.children)) {
      walkInline(node.children as RootContent[], bold, italic);
    }
  }
}

function walkTopLevel(root: Root, bold: EmphasisSegment[], italic: EmphasisSegment[]) {
  let group: Group | undefined;

  for (const child of root.children) {
    if (child.type === "heading") continue; // titres : jamais de sémantique gras/italique (§2.1)

    const paragraph = child.type === "paragraph" ? (child as Paragraph) : undefined;
    const emphasisChild = paragraph ? fullEmphasisChild(paragraph) : undefined;

    if (paragraph && emphasisChild) {
      const { classification, ambiguous } = classify(emphasisChild);
      const canMerge =
        group &&
        group.classification === classification &&
        blankLinesBetween(group.paragraphs[group.paragraphs.length - 1], paragraph) === 1;
      if (canMerge) {
        group!.paragraphs.push(paragraph);
        group!.ambiguous = group!.ambiguous || ambiguous;
      } else {
        flushGroup(group, bold, italic);
        group = { classification, ambiguous, paragraphs: [paragraph] };
      }
      continue;
    }

    flushGroup(group, bold, italic);
    group = undefined;

    if ("children" in child && Array.isArray(child.children)) {
      walkInline(child.children as RootContent[], bold, italic);
    }
  }
  flushGroup(group, bold, italic);
}

export function parseChapter(markdown: string): ParsedChapter {
  const root = processor.parse(markdown) as Root;
  const titleTree = buildTitleTree(root, markdown.length);
  const boldSegments: EmphasisSegment[] = [];
  const italicSegments: EmphasisSegment[] = [];
  walkTopLevel(root, boldSegments, italicSegments);
  return { titleTree, boldSegments, italicSegments };
}
