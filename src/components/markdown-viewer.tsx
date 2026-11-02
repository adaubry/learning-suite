"use client";

import { useMemo, type ReactNode } from "react";
import type { Root, RootContent, Paragraph, Text, Table } from "mdast";
import { parseMarkdown } from "@/core/fiche/markdown";
import { cn } from "@/lib/utils";

// MarkdownViewer : rendu maison depuis l'AST remark (GFM : tableaux des fiches,
// FORMAT.md v2). Pas de lib HTML. `data-md-start`/`data-md-end` sur chaque bloc
// top-level : ancrage du sommaire de lecture (AnnotatedCourse).

function offsets(node: RootContent) {
  return { start: node.position!.start.offset!, end: node.position!.end.offset! };
}

function renderInline(nodes: RootContent[], key: string): ReactNode {
  return nodes.map((node, i) => {
    const k = `${key}-${i}`;
    if (node.type === "text") return (node as Text).value;
    if (node.type === "strong") {
      return <strong key={k}>{renderInline(node.children as RootContent[], k)}</strong>;
    }
    if (node.type === "emphasis") {
      return <em key={k}>{renderInline(node.children as RootContent[], k)}</em>;
    }
    if (node.type === "inlineCode") return <code key={k}>{node.value}</code>;
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
    // Titre vide (saut de page exporté par Google Docs) : rien à afficher.
    if (!node.children.length) return null;
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
  if (node.type === "table") return renderTable(node, key, anchorProps, fontClassName);
  // Autre contenu (blockquote…) : bloc brut minimal.
  if ("children" in node && Array.isArray(node.children)) {
    return (
      <div key={key} {...anchorProps}>
        {renderInline(node.children as RootContent[], key)}
      </div>
    );
  }
  return null;
}

function renderTable(
  node: Table,
  key: string,
  anchorProps: Record<string, number>,
  fontClassName?: string,
): ReactNode {
  const [head, ...body] = node.children;
  return (
    <div key={key} className="overflow-x-auto" {...anchorProps}>
      <table className={cn("w-full border-collapse text-left", fontClassName)}>
        <thead>
          <tr>
            {head.children.map((cell, i) => (
              <th key={i} className="border border-border bg-muted px-2 py-1 font-semibold">
                {renderInline(cell.children as RootContent[], `${key}-h${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr key={r}>
              {row.children.map((cell, i) => (
                <td key={i} className="border border-border px-2 py-1 align-top">
                  {renderInline(cell.children as RootContent[], `${key}-${r}-${i}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MarkdownViewer({ markdown, className }: { markdown: string; className?: string }) {
  // Mémoïsé sur `markdown` : sans ça, tout re-render du parent (ex. frappe
  // dans une note de marge, AnnotatedCourse) reparse toute la fiche.
  const root = useMemo(() => parseMarkdown(markdown) as Root, [markdown]);
  return (
    <div className={cn("max-w-none space-y-3 text-sm", className)}>
      {root.children
        .filter((node) => node.type !== "yaml")
        .map((node, i) => renderBlock(node, `b${i}`, className))}
    </div>
  );
}
