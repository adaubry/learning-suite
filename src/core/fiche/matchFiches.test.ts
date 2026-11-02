import { describe, expect, it } from "vitest";
import { matchFiches, normalizeTitre } from "./matchFiches";

const ex = (id: string, numero: number, titre: string, contentHash = `h-${id}`) => ({ id, numero, titre, contentHash });

describe("matchFiches", () => {
  it("fiches identiques : tout inchangé", () => {
    const r = matchFiches([ex("a", 1, "A", "h1")], [{ numero: 1, titre: "A", contentHash: "h1" }]);
    expect(r).toEqual({ appariements: [{ index: 0, existanteId: "a", statut: "inchangee" }], retirees: [] });
  });

  it("une fiche insérée décale les numéros : l'appariement suit le titre", () => {
    const r = matchFiches(
      [ex("a", 1, "Alpha", "ha"), ex("b", 2, "Beta", "hb")],
      [
        { numero: 1, titre: "Alpha", contentHash: "ha" },
        { numero: 2, titre: "Nouvelle", contentHash: "hn" },
        { numero: 3, titre: "Beta", contentHash: "hb" },
      ],
    );
    expect(r.appariements).toEqual([
      { index: 0, existanteId: "a", statut: "inchangee" },
      { index: 1, existanteId: null, statut: "nouvelle" },
      { index: 2, existanteId: "b", statut: "modifiee" },
    ]);
    expect(r.retirees).toEqual([]);
  });

  it("titre reformulé, même numéro : apparié par numéro, modifié", () => {
    const r = matchFiches([ex("a", 4, "Ancien titre")], [{ numero: 4, titre: "Titre reformulé", contentHash: "x" }]);
    expect(r.appariements[0]).toEqual({ index: 0, existanteId: "a", statut: "modifiee" });
  });

  it("le titre prime sur le numéro, et une existante n'est appariée qu'une fois", () => {
    const r = matchFiches(
      [ex("a", 1, "Alpha"), ex("b", 2, "Beta")],
      [
        { numero: 1, titre: "Beta", contentHash: "h-b" },
        { numero: 2, titre: "Gamma", contentHash: "z" },
      ],
    );
    expect(r.appariements.map((a) => a.existanteId)).toEqual(["b", null]);
    expect(r.retirees).toEqual(["a"]);
  });

  it("fiches absentes du nouvel import : retirées", () => {
    const r = matchFiches([ex("a", 1, "A"), ex("b", 2, "B")], [{ numero: 1, titre: "A", contentHash: "h-a" }]);
    expect(r.retirees).toEqual(["b"]);
  });

  it("normalise accents, casse, apostrophes et ponctuation", () => {
    expect(normalizeTitre("L’arrêt  Cadot, aboutissement")).toBe(normalizeTitre("L'arret cadot — aboutissement"));
  });
});
