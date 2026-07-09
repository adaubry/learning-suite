// P4 — matchSections (FUNCTIONS.md §1, ARCHITECTURE.md §7). La fonction la plus dangereuse
// du projet : ancien plan (sections déjà en base) × nouvel arbre de titres (chapitre
// ré-importé) → table d'appariement {intacte, modifiée, disparue} + blocs vraiment nouveaux.
//
// Trois passes successives, dans cet ordre (position-indépendantes d'abord, position-dépendante
// en dernier recours) : hash de contenu exact, titre exact, similarité titre+position. Seuil
// conservateur (FUNCTIONS §1) : un groupe ambigu (comptes différents, aucun candidat au-dessus
// du seuil) n'est jamais forcé — les éléments restent "disparue" côté ancien et "nouvelle" côté
// nouveau plutôt qu'un mauvais appariement qui polluerait l'historique en silence.

import type { TitleNode } from "@/core/parser/types";
import { mechanicalSectioning } from "@/core/sectioning/mechanicalSectioning";
import { computeContentHash } from "@/core/parser/contentHash";

export interface OldSection {
  id: string;
  titre: string;
  ordre: number;
  contenu: string;
}

export interface NewBlock {
  titre: string;
  start: number;
  end: number;
  contenu: string;
}

export type MatchStatus = "intacte" | "modifiee";

export interface SectionMatch {
  ancienneId: string;
  statut: MatchStatus;
  nouveauBloc: NewBlock;
}

export interface DisparueSection {
  ancienneId: string;
}

export interface MatchSectionsResult {
  appariements: SectionMatch[];
  disparues: DisparueSection[];
  nouvelles: NewBlock[];
}

function normalizeTitre(t: string): string {
  return t.trim().replace(/\s+/g, " ");
}

// Similarité lexicale simple (Jaccard sur les mots) — 100% maison (TECH_MAPPING §6 : aucune
// lib pour P4). ponytail: heuristique grossière, seuil à recalibrer si de vraies évolutions de
// cours produisent trop de faux positifs/négatifs une fois l'usage réel disponible (Bloc 8.4).
function titleSimilarity(a: string, b: string): number {
  const wa = new Set(normalizeTitre(a).toLowerCase().split(" "));
  const wb = new Set(normalizeTitre(b).toLowerCase().split(" "));
  const inter = [...wa].filter((w) => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union === 0 ? 0 : inter / union;
}

function matchByGroup<K>(
  ancienRestant: Map<string, OldSection>,
  nouveauRestant: Set<number>,
  blocs: NewBlock[],
  statut: MatchStatus,
  ancienKey: (s: OldSection) => K,
  nouveauKey: (b: NewBlock) => K,
): SectionMatch[] {
  const ancienParClef = new Map<K, OldSection[]>();
  for (const s of ancienRestant.values()) {
    const k = ancienKey(s);
    const group = ancienParClef.get(k) ?? [];
    group.push(s);
    ancienParClef.set(k, group);
  }
  const nouveauParClef = new Map<K, number[]>();
  for (const i of nouveauRestant) {
    const k = nouveauKey(blocs[i]);
    const group = nouveauParClef.get(k) ?? [];
    group.push(i);
    nouveauParClef.set(k, group);
  }

  const matches: SectionMatch[] = [];
  for (const [key, oldGroup] of ancienParClef) {
    const newGroup = nouveauParClef.get(key);
    if (!newGroup || newGroup.length !== oldGroup.length) continue; // ambigu : passes suivantes
    const oldSorted = [...oldGroup].sort((a, b) => a.ordre - b.ordre);
    const newSorted = [...newGroup].sort((a, b) => blocs[a].start - blocs[b].start);
    for (let i = 0; i < oldSorted.length; i++) {
      matches.push({ ancienneId: oldSorted[i].id, statut, nouveauBloc: blocs[newSorted[i]] });
      ancienRestant.delete(oldSorted[i].id);
      nouveauRestant.delete(newSorted[i]);
    }
  }
  return matches;
}

const SIMILARITE_SEUIL = 0.5;

function matchBySimilarity(
  ancienRestant: Map<string, OldSection>,
  nouveauRestant: Set<number>,
  blocs: NewBlock[],
  ancienMaxOrdre: number,
): SectionMatch[] {
  const candidats: { score: number; oldId: string; newIndex: number }[] = [];
  const nouveauIndex = [...nouveauRestant];
  for (const s of ancienRestant.values()) {
    for (const i of nouveauIndex) {
      const titre = titleSimilarity(s.titre, blocs[i].titre);
      if (titre === 0) continue; // aucun mot commun : jamais un candidat, position seule ne suffit pas
      const posOld = ancienMaxOrdre <= 1 ? 0 : (s.ordre - 1) / (ancienMaxOrdre - 1);
      const posNew = nouveauIndex.length <= 1 ? 0 : i / (blocs.length - 1 || 1);
      const position = 1 - Math.abs(posOld - posNew);
      const score = 0.7 * titre + 0.3 * position;
      if (score >= SIMILARITE_SEUIL) candidats.push({ score, oldId: s.id, newIndex: i });
    }
  }
  candidats.sort((a, b) => b.score - a.score);

  const matches: SectionMatch[] = [];
  for (const c of candidats) {
    if (!ancienRestant.has(c.oldId) || !nouveauRestant.has(c.newIndex)) continue; // déjà pris
    const s = ancienRestant.get(c.oldId)!;
    matches.push({ ancienneId: s.id, statut: "modifiee", nouveauBloc: blocs[c.newIndex] });
    ancienRestant.delete(c.oldId);
    nouveauRestant.delete(c.newIndex);
  }
  return matches;
}

export function matchSections(
  ancien: OldSection[],
  titleTree: TitleNode[],
  nouveauMarkdown: string,
): MatchSectionsResult {
  const blocs: NewBlock[] = mechanicalSectioning(titleTree, nouveauMarkdown.length).map((b) => ({
    ...b,
    contenu: nouveauMarkdown.slice(b.start, b.end),
  }));

  const ancienRestant = new Map(ancien.map((s) => [s.id, s]));
  const nouveauRestant = new Set(blocs.map((_, i) => i));

  const appariements: SectionMatch[] = [
    ...matchByGroup(ancienRestant, nouveauRestant, blocs, "intacte", (s) => computeContentHash(s.contenu), (b) =>
      computeContentHash(b.contenu),
    ),
    ...matchByGroup(ancienRestant, nouveauRestant, blocs, "modifiee", (s) => normalizeTitre(s.titre), (b) =>
      normalizeTitre(b.titre),
    ),
  ];

  const ancienMaxOrdre = Math.max(0, ...ancien.map((s) => s.ordre));
  appariements.push(...matchBySimilarity(ancienRestant, nouveauRestant, blocs, ancienMaxOrdre));

  const disparues: DisparueSection[] = [...ancienRestant.values()].map((s) => ({ ancienneId: s.id }));
  const nouvelles: NewBlock[] = [...nouveauRestant].map((i) => blocs[i]);

  return { appariements, disparues, nouvelles };
}
