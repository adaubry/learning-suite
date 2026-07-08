import { describe, expect, it } from "vitest";
import { computeVerdict, presentCorrection, type MergedDiffPoint, type MergedErrorCandidate } from "./presentCorrection";

function point(overrides: Partial<MergedDiffPoint>): MergedDiffPoint {
  return {
    intitule: "Point",
    type: "important",
    statut: "couvert",
    attendu: "attendu",
    explication: "explication",
    ...overrides,
  };
}

function candidate(overrides: Partial<MergedErrorCandidate>): MergedErrorCandidate {
  return {
    type: "confusion",
    description: "description",
    idErreurExistante: null,
    ...overrides,
  };
}

describe("computeVerdict", () => {
  it("acquis si aucun point critique manquant ou déformé", () => {
    const diff = [point({ type: "critique", statut: "couvert" }), point({ type: "secondaire", statut: "manquant" })];
    expect(computeVerdict(diff)).toBe("acquis");
  });

  it("insuffisant si un point critique manquant", () => {
    const diff = [point({ type: "critique", statut: "manquant" })];
    expect(computeVerdict(diff)).toBe("insuffisant");
  });

  it("insuffisant si un point critique déformé (au moins aussi grave qu'absent)", () => {
    const diff = [point({ type: "critique", statut: "deforme" })];
    expect(computeVerdict(diff)).toBe("insuffisant");
  });

  it("acquis si seuls des points important/secondaire sont manquants", () => {
    const diff = [point({ type: "important", statut: "manquant" }), point({ type: "secondaire", statut: "deforme" })];
    expect(computeVerdict(diff)).toBe("acquis");
  });
});

describe("presentCorrection", () => {
  it("divulgation contrôlée : masque attendu/explication des points non couverts", () => {
    const diff = [
      point({ intitule: "A", statut: "couvert" }),
      point({ intitule: "B", statut: "manquant" }),
      point({ intitule: "C", statut: "deforme" }),
    ];

    const result = presentCorrection({ diff, erreursCandidates: [] }, { verdict: "insuffisant", retryAttendu: true });

    expect(result.divulgation).toBe("controlee");
    expect(result.diff).toEqual([
      { intitule: "A", statut: "couvert", attendu: "attendu", explication: "explication" },
      { intitule: "B", statut: "manquant" },
      { intitule: "C", statut: "deforme" },
    ]);
  });

  it("divulgation complète : tout passe, y compris les points non couverts", () => {
    const diff = [point({ intitule: "B", statut: "manquant" })];

    const result = presentCorrection({ diff, erreursCandidates: [] }, { verdict: "acquis", retryAttendu: false });

    expect(result.divulgation).toBe("complete");
    expect(result.diff).toEqual([{ intitule: "B", statut: "manquant", attendu: "attendu", explication: "explication" }]);
  });

  it("reporte le verdict fourni par l'appelant, sans le recalculer", () => {
    const diff = [point({ type: "critique", statut: "manquant" })];
    const result = presentCorrection({ diff, erreursCandidates: [] }, { verdict: "insuffisant", retryAttendu: true });
    expect(result.verdict).toBe("insuffisant");
  });

  it("divulgation contrôlée : masque la description des erreurs candidates, garde type et récidive", () => {
    const result = presentCorrection(
      { diff: [], erreursCandidates: [candidate({ type: "omission", idErreurExistante: "err-1" })] },
      { verdict: "insuffisant", retryAttendu: true },
    );
    expect(result.erreursCandidates).toEqual([{ type: "omission", idErreurExistante: "err-1" }]);
  });

  it("divulgation complète : la description des erreurs candidates passe", () => {
    const result = presentCorrection(
      { diff: [], erreursCandidates: [candidate({ description: "confond X et Y" })] },
      { verdict: "acquis", retryAttendu: false },
    );
    expect(result.erreursCandidates).toEqual([{ type: "confusion", description: "confond X et Y", idErreurExistante: null }]);
  });
});
