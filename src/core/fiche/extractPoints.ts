import type { List, ListItem, Nodes, Paragraph, RootContent, Table } from "mdast";
import { parseMarkdown, nodeText } from "./markdown";

// extractPoints (ARCHITECTURE.md v2 §6) — pur. Dérive les points de contrôle de
// la correction depuis le corps d'une fiche : la structure de la fiche (thèse,
// étiquettes, tableaux) EST le barème, aucune rubrique n'est générée ni stockée.
// Les « Complément (hors cours) » ne deviennent jamais des points : un blurting
// n'est pas jugé sur ce que le cours ne dit pas.

export type PointType = "critique" | "important" | "secondaire";

export interface PointFiche {
  type: PointType;
  /** Cause / Conséquence / Logique : « dire pourquoi », noté à part. */
  raisonnement: boolean;
  etiquette: string;
  intitule: string;
  attendu: string;
}

type Classement = { type: PointType; raisonnement: boolean } | "exclu";

function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function classer(etiquette: string): Classement {
  const l = normalizeLabel(etiquette);
  if (l.startsWith("complement")) return "exclu";
  if (l === "definition" || l === "texte") return { type: "critique", raisonnement: false };
  if (l === "cause" || l === "consequence" || l === "logique") return { type: "important", raisonnement: true };
  if (l === "lien") return { type: "secondaire", raisonnement: false };
  return { type: "important", raisonnement: false };
}

// Un bloc étiqueté commence par un passage en gras terminé par « : » (dans le
// gras, ou juste après lui) : `**Cause :** texte` ou `**Cause** : texte`.
function lireEtiquette(p: Paragraph): { etiquette: string; reste: string } | null {
  const [first, ...rest] = p.children;
  if (!first || first.type !== "strong") return null;
  const gras = nodeText(first);
  const suite = rest.map((n) => nodeText(n as Nodes)).join(" ").trim();
  const deuxPointsDansGras = gras.endsWith(":");
  if (!deuxPointsDansGras && !suite.startsWith(":")) return null;
  const etiquette = gras.replace(/:$/, "").trim();
  if (!etiquette) return null;
  const reste = rawRest(p).replace(/^\s*:\s*/, "").trim();
  return { etiquette, reste };
}

// Texte après le premier nœud (le gras), sans perdre les espaces de jointure.
function rawRest(p: Paragraph): string {
  return nodeText({ type: "paragraph", children: p.children.slice(1) });
}

function intituleAvec(base: string, sousTitre: string | null): string {
  return sousTitre ? `${base} — ${sousTitre}` : base;
}

export function extractPoints(contenu: string): PointFiche[] {
  const root = parseMarkdown(contenu);
  const points: PointFiche[] = [];
  let sousTitre: string | null = null;
  let premierBloc = true;

  const ajouterEtiquete = (etiquette: string, attendu: string) => {
    const c = classer(etiquette);
    if (c === "exclu" || !attendu) return;
    points.push({ ...c, etiquette, intitule: intituleAvec(etiquette, sousTitre), attendu });
  };
  const ajouterLibre = (etiquette: string, attendu: string) => {
    if (!attendu) return;
    points.push({
      type: "important",
      raisonnement: false,
      etiquette,
      intitule: intituleAvec(etiquette, sousTitre),
      attendu,
    });
  };

  const paragraphe = (p: Paragraph) => {
    const lu = lireEtiquette(p);
    if (lu) return ajouterEtiquete(lu.etiquette, lu.reste);
    const texte = nodeText(p);
    if (premierBloc) {
      if (texte) points.push({ type: "critique", raisonnement: false, etiquette: "Thèse", intitule: "Thèse", attendu: texte });
      return;
    }
    ajouterLibre("Paragraphe", texte);
  };

  const liste = (l: List) => {
    let groupe: string[] = [];
    const vider = () => {
      ajouterLibre("Liste", groupe.join(" ; "));
      groupe = [];
    };
    for (const item of l.children as ListItem[]) {
      const [tete, ...suite] = item.children;
      const lu = tete?.type === "paragraph" ? lireEtiquette(tete) : null;
      if (lu) {
        vider();
        const complement = suite.map((n) => nodeText(n)).join(" ");
        ajouterEtiquete(lu.etiquette, [lu.reste, complement].filter(Boolean).join(" "));
      } else {
        groupe.push(nodeText(item));
      }
    }
    vider();
  };

  const tableau = (t: Table) => {
    const [entete, ...lignes] = t.children.map((row) => row.children.map((cell) => nodeText(cell)));
    for (const cellules of lignes) {
      const libelle = cellules[0] || entete[0] || "Ligne";
      // Colonne 0 sans en-tête = libellé de ligne (tableau comparatif) : déjà dans l'intitulé.
      const attendu = cellules
        .map((c, i) => (i === 0 && !entete[0] ? "" : entete[i] && c ? `${entete[i]} : ${c}` : c))
        .filter(Boolean)
        .join(" ; ");
      if (!attendu) continue;
      points.push({
        type: "important",
        raisonnement: false,
        etiquette: "Tableau",
        intitule: intituleAvec(libelle, sousTitre),
        attendu,
      });
    }
  };

  for (const node of root.children as RootContent[]) {
    if (node.type === "heading") {
      if (node.depth >= 3) sousTitre = nodeText(node);
      premierBloc = false;
      continue;
    }
    if (node.type === "paragraph") paragraphe(node);
    else if (node.type === "list") liste(node);
    else if (node.type === "table") tableau(node);
    else if (node.type !== "thematicBreak" && node.type !== "html") ajouterLibre("Paragraphe", nodeText(node));
    premierBloc = false;
  }

  return points;
}
