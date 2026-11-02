import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import type { Root, Nodes } from "mdast";

// Pipeline remark partagé par tout le module fiche (FORMAT.md v2) : GFM pour les
// tableaux, qui portent une bonne part du contenu des fiches.
const parser = unified().use(remarkParse).use(remarkGfm);
const normalizer = unified().use(remarkParse).use(remarkGfm).use(remarkStringify);

export function parseMarkdown(markdown: string): Root {
  return parser.parse(markdown) as Root;
}

// Re-sérialisation canonique (fins de ligne, espacement, échappements) : deux
// exports Google Docs du même texte donnent la même chaîne.
export function normalizeMarkdown(markdown: string): string {
  return String(normalizer.processSync(markdown)).trim();
}

// Texte brut d'un nœud, espaces normalisés (espaces insécables de la typographie
// française compris).
export function nodeText(node: Nodes): string {
  return rawText(node).replace(/[\s  ]+/g, " ").trim();
}

function rawText(node: Nodes): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  if (node.type === "break") return " ";
  if ("children" in node) return (node.children as Nodes[]).map(rawText).join("");
  return "";
}
