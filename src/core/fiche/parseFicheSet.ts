import { createHash } from "node:crypto";
import type { Heading } from "mdast";
import { parseMarkdown, normalizeMarkdown, nodeText } from "./markdown";

// parseFicheSet (FORMAT.md v2 §1-2) — pur. Découpe un set de fiches par titre 2 :
// chaque titre 2 ouvre une fiche, son corps court jusqu'au titre 2 suivant et
// est conservé tel quel (affichage en lecture). Le numéro est lu dans le titre
// (« 3. Titre ») ; sans numéro, la position dans le document en tient lieu.
// Un titre 2 VIDE (`## ` seul) est le paragraphe de saut de page que Google Docs
// exporte entre deux fiches (une fiche = une page) : il clôt la fiche précédente
// sans en ouvrir une.

export interface ParsedFiche {
  numero: number;
  titre: string;
  contenu: string;
  contentHash: string;
}

export interface ParsedFicheSet {
  fiches: ParsedFiche[];
  avertissements: string[];
}

const NUMERO_TITRE = /^(\d+)\s*[.)]\s*(.*)$/;

export function ficheContentHash(titre: string, contenu: string): string {
  return createHash("sha256").update(`${titre}\n${normalizeMarkdown(contenu)}`, "utf8").digest("hex");
}

export function parseFicheSet(markdown: string): ParsedFicheSet {
  const root = parseMarkdown(markdown);
  const titres2 = root.children.filter((n): n is Heading => n.type === "heading" && n.depth === 2);
  const headings = titres2.filter((h) => nodeText(h) !== "");
  const avertissements: string[] = [];

  const preambule = root.children.filter(
    (n) => n.position!.end.offset! <= (headings[0]?.position!.start.offset ?? Infinity),
  );
  if (preambule.some((n) => !(n.type === "heading" && n.depth === 1))) {
    avertissements.push("Du texte précède la première fiche : il est ignoré.");
  }

  const fiches = headings.map((heading, i) => {
    const texte = nodeText(heading);
    const match = NUMERO_TITRE.exec(texte);
    const numero = match ? Number(match[1]) : i + 1;
    const titre = (match?.[2] || texte).trim();

    const start = heading.position!.end.offset!;
    const end = titres2.find((h) => h.position!.start.offset! >= start)?.position!.start.offset ?? markdown.length;
    const contenu = markdown.slice(start, end).trim();

    if (!match) avertissements.push(`Fiche « ${titre} » sans numéro : numéro ${numero} attribué d'après sa position.`);
    return { numero, titre, contenu, contentHash: ficheContentHash(titre, contenu) };
  });

  // Texte entre un saut de page et la fiche suivante : n'appartient à aucune fiche.
  for (const vide of titres2.filter((h) => nodeText(h) === "")) {
    const debut = vide.position!.end.offset!;
    const fin = titres2.find((h) => h.position!.start.offset! >= debut)?.position!.start.offset ?? markdown.length;
    if (markdown.slice(debut, fin).trim()) avertissements.push("Du texte suit un titre vide (saut de page) : il est ignoré.");
  }

  const vus = new Set<number>();
  for (const f of fiches) {
    if (vus.has(f.numero)) avertissements.push(`Numéro ${f.numero} utilisé par plusieurs fiches.`);
    vus.add(f.numero);
  }

  return { fiches, avertissements };
}
