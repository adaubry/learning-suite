// P3 — computeContentHash (FUNCTIONS.md §1, FORMAT.md §5/§6.5).
// Markdown -> empreinte stable après normalisation légère (fins de ligne, espaces), pour éviter
// les faux positifs d'export Google Docs. Fondement du versionnage.
//
// La normalisation est déléguée à remark-stringify (parse -> stringify), qui canonicalise la
// syntaxe (fins de ligne, espacement) sans jamais altérer le contenu sémantique — hard-breaks
// inclus. Pas de normalisation regex maison sur le texte brut (FORMAT §6.5).

import { createHash } from "node:crypto";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkFrontmatter from "remark-frontmatter";

const processor = unified().use(remarkParse).use(remarkFrontmatter).use(remarkStringify);

export function computeContentHash(markdown: string): string {
  const normalized = String(processor.processSync(markdown));
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
