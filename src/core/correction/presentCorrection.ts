// P10 · presentCorrection (FUNCTIONS §1, ARCHITECTURE §5) — divulgation contrôlée :
// tant qu'un nouvel essai est attendu, un point manquant/déformé ne montre que son
// intitulé (jamais `attendu` NI `explication` — l'explication du LLM peut révéler
// la réponse, ex. « vous avez oublié que la loi est la 3e source »). Pur pour être
// testable ; appliqué exclusivement côté serveur (S4) : les champs masqués ne sont
// jamais construits pour le client, pas juste cachés côté rendu.

export type PointType = "critique" | "important" | "secondaire";
export type PointStatut = "couvert" | "manquant" | "deforme";

export interface MergedDiffPoint {
  intitule: string;
  type: PointType;
  statut: PointStatut;
  attendu: string;
  explication: string;
}

export type ErreurType = "omission" | "deformation" | "confusion" | "imprecision";

export interface MergedErrorCandidate {
  type: ErreurType;
  description: string;
  idErreurExistante: string | null;
}

export interface Correction {
  diff: MergedDiffPoint[];
  erreursCandidates: MergedErrorCandidate[];
}

// verdict = "insuffisant" si un point CRITIQUE est manquant OU déformé (une
// définition déformée est au moins aussi grave qu'une définition absente) —
// calculé en code depuis le diff plutôt que retourné par le modèle (DECISIONS.md,
// bloc 5.1 : même doctrine que L1/bornes et L2/couverture-gras, déviation du
// contrat ARCHITECTURE §9 qui prévoyait un verdict proposé par le LLM).
export function computeVerdict(diff: MergedDiffPoint[]): "acquis" | "insuffisant" {
  const critiqueDefaillant = diff.some(
    (p) => p.type === "critique" && (p.statut === "manquant" || p.statut === "deforme"),
  );
  return critiqueDefaillant ? "insuffisant" : "acquis";
}

export type FilteredDiffPoint =
  | { intitule: string; statut: "couvert"; attendu: string; explication: string }
  | { intitule: string; statut: "manquant" | "deforme"; attendu?: string; explication?: string };

// USER_FLOW É3.2 : « les intitulés d'erreurs suivent la même divulgation contrôlée
// que le diff » — la `description` d'une erreur candidate peut elle aussi révéler
// la bonne réponse (elle documente ce qui aurait dû être dit) ; seul `type` (le
// badge) et `idErreurExistante` (le badge « récidive », qui ne révèle rien du
// cours) passent en divulgation contrôlée.
export interface FilteredErrorCandidate {
  type: ErreurType;
  description?: string;
  idErreurExistante: string | null;
}

export interface FilteredCorrection {
  verdict: "acquis" | "insuffisant";
  diff: FilteredDiffPoint[];
  erreursCandidates: FilteredErrorCandidate[];
  divulgation: "controlee" | "complete";
}

export interface DivulgationContext {
  /** Déjà calculé par l'appelant (P10.computeVerdict) — simplement reporté dans la
   *  réponse filtrée, jamais recalculé ici (l'appelant en a de toute façon besoin
   *  avant même d'appeler presentCorrection, pour construire `retryAttendu`). */
  verdict: "acquis" | "insuffisant";
  /** Un nouvel essai de mémoire est-il encore attendu sur cette section ? Faux en
   *  révision (divulgation complète d'emblée, ARCHITECTURE §6), faux en étude dès
   *  verdict acquis ou révélation explicite. Résolu par l'appelant (S4) : P10 ne
   *  fait qu'appliquer le masquage, il ne décide pas s'il est dû. */
  retryAttendu: boolean;
}

export function presentCorrection(
  correction: Correction,
  context: DivulgationContext,
): FilteredCorrection {
  const { verdict, retryAttendu } = context;
  const divulgation = retryAttendu ? "controlee" : "complete";

  const diff: FilteredDiffPoint[] = correction.diff.map((p) => {
    if (retryAttendu && p.statut !== "couvert") {
      return { intitule: p.intitule, statut: p.statut };
    }
    return { intitule: p.intitule, statut: p.statut, attendu: p.attendu, explication: p.explication };
  });

  const erreursCandidates: FilteredErrorCandidate[] = correction.erreursCandidates.map((e) => {
    if (retryAttendu) {
      return { type: e.type, idErreurExistante: e.idErreurExistante };
    }
    return { type: e.type, description: e.description, idErreurExistante: e.idErreurExistante };
  });

  return { verdict, diff, erreursCandidates, divulgation };
}
