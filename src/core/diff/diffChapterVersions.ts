// P5 — diffChapterVersions (FUNCTIONS.md §1). Deux Markdown → segments ajoutés / supprimés /
// modifiés / inchangés, alignés par titres (le diff ne dérive pas sur tout le document après une
// insertion). Sert É6.3 (ré-import) et l'historique É6.1. Purement visuel : contrairement à P4
// (matchSections), ce diff ne décide d'aucune transition d'état — il alimente U6 DiffViewer.
//
// TECH_MAPPING §6 : jsdiff pour le diff textuel, alignement par titres maison AU-DESSUS —
// `Diff.diffArrays` avec un comparateur sur le titre fait l'alignement de séquence (LCS) sans
// réimplémenter cette part-là ; `Diff.diffWords` fait le diff fin à l'intérieur de chaque paire.

import * as Diff from "diff";
import type { TitleNode } from "@/core/parser/types";
import { mechanicalSectioning } from "@/core/sectioning/mechanicalSectioning";

interface Bloc {
  titre: string;
  contenu: string;
}

export type SegmentType = "ajoute" | "supprime" | "modifie" | "inchange";

export interface DiffSegment {
  type: SegmentType;
  titre: string;
  ancienContenu?: string;
  nouveauContenu?: string;
  /** Diff mot-à-mot (uniquement pour "modifie") — affichage inline dans U6. */
  mots?: Diff.Change[];
}

function blocs(markdown: string, titleTree: TitleNode[]): Bloc[] {
  // .trim() : les bornes d'un TitleNode (P1) s'arrêtent juste avant le titre suivant (ou la fin
  // du document) — un bloc en fin de document n'a pas le même blanc de fin qu'un bloc suivi
  // d'un autre titre, alors que le contenu réel est identique (cf. matchSections, même souci).
  return mechanicalSectioning(titleTree, markdown.length).map((b) => ({
    titre: b.titre,
    contenu: markdown.slice(b.start, b.end).trim(),
  }));
}

export function diffChapterVersions(
  ancienMarkdown: string,
  ancienTitleTree: TitleNode[],
  nouveauMarkdown: string,
  nouveauTitleTree: TitleNode[],
): DiffSegment[] {
  const ancienBlocs = blocs(ancienMarkdown, ancienTitleTree);
  const nouveauBlocs = blocs(nouveauMarkdown, nouveauTitleTree);

  // File d'attente par titre : gère les doublons de titre en appariant dans l'ordre
  // d'apparition, comme matchSections (P4) le fait pour ses propres passes par groupe.
  const ancienParTitre = new Map<string, Bloc[]>();
  for (const b of ancienBlocs) {
    const q = ancienParTitre.get(b.titre) ?? [];
    q.push(b);
    ancienParTitre.set(b.titre, q);
  }

  const parties = Diff.diffArrays(ancienBlocs, nouveauBlocs, {
    comparator: (a, b) => a.titre === b.titre,
  });

  const segments: DiffSegment[] = [];
  for (const partie of parties) {
    if (partie.removed) {
      for (const b of partie.value as Bloc[]) {
        segments.push({ type: "supprime", titre: b.titre, ancienContenu: b.contenu });
      }
      continue;
    }
    if (partie.added) {
      for (const b of partie.value as Bloc[]) {
        segments.push({ type: "ajoute", titre: b.titre, nouveauContenu: b.contenu });
      }
      continue;
    }
    // Partie commune (par titre) : diffArrays renvoie les éléments du nouveau tableau.
    for (const nouveauBloc of partie.value as Bloc[]) {
      const ancienBloc = ancienParTitre.get(nouveauBloc.titre)?.shift();
      if (!ancienBloc) {
        // Ne devrait pas arriver (comparateur symétrique) — traité comme un ajout pur plutôt
        // que de planter le rendu du diff.
        segments.push({ type: "ajoute", titre: nouveauBloc.titre, nouveauContenu: nouveauBloc.contenu });
        continue;
      }
      if (ancienBloc.contenu === nouveauBloc.contenu) {
        segments.push({ type: "inchange", titre: nouveauBloc.titre, nouveauContenu: nouveauBloc.contenu });
        continue;
      }
      segments.push({
        type: "modifie",
        titre: nouveauBloc.titre,
        ancienContenu: ancienBloc.contenu,
        nouveauContenu: nouveauBloc.contenu,
        mots: Diff.diffWords(ancienBloc.contenu, nouveauBloc.contenu),
      });
    }
  }

  return segments;
}
