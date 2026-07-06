// P2 — validateDocument (FUNCTIONS.md §1, FORMAT.md §6.4).
// Arbre P1 -> anomalies typées et localisées. Batterie de règles indépendantes, extensible.
// Le parseur ne corrige jamais : toute anomalie est montrée à l'utilisateur.

import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Node } from "unist";
import type { Anomaly, ParsedChapter, TitleNode } from "./types";

const processor = unified().use(remarkParse);

function hierarchieNonDescendante(titleTree: TitleNode[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const visit = (node: TitleNode) => {
    for (const child of node.children) {
      if (child.level - node.level > 1) {
        anomalies.push({
          type: "hierarchie_non_descendante",
          message: `Titre ${"#".repeat(child.level)} directement sous un titre ${"#".repeat(node.level)} : saut de niveau.`,
          start: child.start,
          end: child.end,
        });
      }
      visit(child);
    }
  };
  for (const root of titleTree) visit(root);
  return anomalies;
}

function grasItaliqueAmbigu(parsed: ParsedChapter): Anomaly[] {
  return parsed.boldSegments
    .filter((segment) => segment.ambiguous)
    .map((segment) => ({
      type: "gras_italique_ambigu" as const,
      message: "Gras et italique imbriqués (***texte***) : ambigu, traité par défaut comme du gras.",
      start: segment.start,
      end: segment.end,
    }));
}

function markdownMalForme(markdown: string): Anomaly[] {
  const root = processor.parse(markdown);
  const anomalies: Anomaly[] = [];
  const visit = (node: Node & { children?: Node[]; position?: Node["position"] }) => {
    if (node.type === "html" && node.position) {
      anomalies.push({
        type: "markdown_mal_forme",
        message: "Balise HTML brute non prise en charge par la convention (FORMAT §2.6).",
        start: node.position.start.offset!,
        end: node.position.end.offset!,
      });
    }
    for (const child of node.children ?? []) visit(child as typeof node);
  };
  visit(root as typeof root & { children?: Node[] });
  return anomalies;
}

export function validateDocument(parsed: ParsedChapter, markdown: string): Anomaly[] {
  return [
    ...hierarchieNonDescendante(parsed.titleTree),
    ...grasItaliqueAmbigu(parsed),
    ...markdownMalForme(markdown),
  ];
}

// Clé stable d'une anomalie (positions uniques par parse) : sert d'identifiant
// d'acquittement partagé entre le client (U5 AnomalyPanel) et le serveur (S1.import).
export function anomalyKey(anomaly: Anomaly): string {
  return `${anomaly.type}-${anomaly.start}-${anomaly.end}`;
}
