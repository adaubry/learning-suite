// matchFiches (ARCHITECTURE.md v2 §5, DECISIONS.md 2026-11-02 « Ré-import ») —
// pur. Apparie les fiches d'un ré-import aux fiches existantes du set : d'abord
// par titre normalisé (robuste à une fiche insérée qui décale la numérotation),
// puis par numéro pour ce qui reste (robuste à un titre reformulé). Une fiche
// appariée garde son identité, donc son historique FSRS.

export interface FicheExistante {
  id: string;
  numero: number;
  titre: string;
  contentHash: string;
}

export interface FicheEntrante {
  numero: number;
  titre: string;
  contentHash: string;
}

export type StatutAppariement = "inchangee" | "modifiee" | "nouvelle";

export interface Appariement {
  index: number;
  existanteId: string | null;
  statut: StatutAppariement;
}

export interface ResultatAppariement {
  appariements: Appariement[];
  retirees: string[];
}

export function normalizeTitre(titre: string): string {
  return titre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchFiches(existantes: FicheExistante[], entrantes: FicheEntrante[]): ResultatAppariement {
  const libres = new Map(existantes.map((e) => [e.id, e]));
  const choix: (FicheExistante | null)[] = entrantes.map(() => null);

  entrantes.forEach((entrante, i) => {
    const cle = normalizeTitre(entrante.titre);
    const trouvee = [...libres.values()].find((e) => normalizeTitre(e.titre) === cle);
    if (trouvee) {
      choix[i] = trouvee;
      libres.delete(trouvee.id);
    }
  });

  entrantes.forEach((entrante, i) => {
    if (choix[i]) return;
    const trouvee = [...libres.values()].find((e) => e.numero === entrante.numero);
    if (trouvee) {
      choix[i] = trouvee;
      libres.delete(trouvee.id);
    }
  });

  const appariements = entrantes.map((entrante, index): Appariement => {
    const e = choix[index];
    if (!e) return { index, existanteId: null, statut: "nouvelle" };
    const identique = e.contentHash === entrante.contentHash && e.numero === entrante.numero;
    return { index, existanteId: e.id, statut: identique ? "inchangee" : "modifiee" };
  });

  return { appariements, retirees: [...libres.keys()] };
}
