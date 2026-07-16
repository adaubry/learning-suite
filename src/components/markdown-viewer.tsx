"use client";

import { useMemo, type ReactNode } from "react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import type { Root, RootContent, Paragraph, Text } from "mdast";
import { cn } from "@/lib/utils";

// U3 MarkdownViewer (FUNCTIONS §6.1) : rendu maison depuis l'AST remark — gras
// (important) et italique (commentaire étudiant) stylés distinctement, mêmes
// couleurs partout (FORMAT §2.2/§2.3). TECH_MAPPING §4.1 : pas de lib HTML,
// composants custom pour les 2 constructions stylées.
//
// `data-md-start`/`data-md-end` sur chaque bloc top-level : ancrage utilisé par
// U5 AnomalyPanel pour le scroll-to-occurrence.

const processor = unified().use(remarkParse).use(remarkFrontmatter);

function offsets(node: RootContent) {
  return { start: node.position!.start.offset!, end: node.position!.end.offset! };
}

function renderInline(nodes: RootContent[], key: string): ReactNode {
  return nodes.map((node, i) => {
    const k = `${key}-${i}`;
    if (node.type === "text") return (node as Text).value;
    if (node.type === "strong") {
      return (
        <strong key={k} className="rounded-none bg-yellow-subtle px-0.5">
          {renderInline(node.children as RootContent[], k)}
        </strong>
      );
    }
    if (node.type === "emphasis") {
      return (
        <em key={k} className="rounded-none bg-blue-subtle px-0.5 not-italic text-blue-vivid">
          {renderInline(node.children as RootContent[], k)}
        </em>
      );
    }
    if (node.type === "break") return <br key={k} />;
    if ("children" in node && Array.isArray(node.children)) {
      return <span key={k}>{renderInline(node.children as RootContent[], k)}</span>;
    }
    return null;
  });
}

const headingTag = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
const headingClass: Record<number, string> = {
  1: "text-2xl font-bold",
  2: "text-xl font-semibold",
  3: "text-lg font-semibold",
  4: "text-base font-semibold",
  5: "text-base font-medium",
  6: "text-sm font-medium",
};

function renderBlock(node: RootContent, key: string, fontClassName?: string): ReactNode {
  const { start, end } = offsets(node);
  const anchorProps = { "data-md-start": start, "data-md-end": end };

  if (node.type === "heading") {
    const Tag = headingTag[node.depth - 1];
    return (
      <Tag key={key} className={cn(headingClass[node.depth], fontClassName)} {...anchorProps}>
        {renderInline(node.children as RootContent[], key)}
      </Tag>
    );
  }
  if (node.type === "paragraph") {
    return (
      <p key={key} className={cn("leading-relaxed", fontClassName)} {...anchorProps}>
        {renderInline((node as Paragraph).children as RootContent[], key)}
      </p>
    );
  }
  if (node.type === "list") {
    const Tag = node.ordered ? "ol" : "ul";
    return (
      <Tag key={key} className={cn("ml-6", node.ordered ? "list-decimal" : "list-disc")} {...anchorProps}>
        {node.children.map((item, i) => (
          <li key={`${key}-${i}`}>
            {item.children.map((child, j) =>
              renderBlock(child as RootContent, `${key}-${i}-${j}`, fontClassName),
            )}
          </li>
        ))}
      </Tag>
    );
  }
  // Contenu ordinaire toléré (FORMAT §2.6, ex. blockquote/table) : transmis en bloc brut minimal.
  if ("children" in node && Array.isArray(node.children)) {
    return (
      <div key={key} {...anchorProps}>
        {renderInline(node.children as RootContent[], key)}
      </div>
    );
  }
  return null;
}

export function MarkdownViewer({ markdown, className }: { markdown: string; className?: string }) {
  // Mémoïsé sur `markdown` : sans ça, tout re-render du parent (ex. frappe
  // dans une note de marge, AnnotatedCourse) reparse tout le chapitre.
  const root = useMemo(() => processor.parse(markdown) as Root, [markdown]);
  return (
    <div className={cn("max-w-none space-y-3 text-sm", className)}>
      {root.children
        .filter((node) => node.type !== "yaml")
        .map((node, i) => renderBlock(node, `b${i}`, className))}
    </div>
  );
}
