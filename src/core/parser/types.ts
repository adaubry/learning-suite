// Types partagés P1/P2/P3 (FUNCTIONS.md §1, FORMAT.md §6).

export type TitleLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface TitleNode {
  level: TitleLevel;
  text: string;
  start: number;
  end: number;
  children: TitleNode[];
}

export interface EmphasisSegment {
  text: string;
  start: number;
  end: number;
  /** `***texte***` (FORMAT §2.5) : ambigu, traité par défaut comme du gras. */
  ambiguous: boolean;
}

export interface ParsedChapter {
  titleTree: TitleNode[];
  boldSegments: EmphasisSegment[];
  italicSegments: EmphasisSegment[];
}

export type AnomalyType =
  | "hierarchie_non_descendante"
  | "gras_italique_ambigu"
  | "markdown_mal_forme";

export interface Anomaly {
  type: AnomalyType;
  message: string;
  start: number;
  end: number;
}
