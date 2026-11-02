import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFicheSet } from "./parseFicheSet";
import { extractPoints } from "./extractPoints";

// @canary — vrai set de fiches de l'utilisateur (Semaine 1, droit administratif),
// converti en Markdown GFM. Fige ce que le parseur doit tirer d'une fiche réelle :
// découpage, thèse critique, étiquettes, tableaux, compléments jamais exigés.

const md = readFileSync("e2e/evals/fixtures/Semaine 1 ADMIN.md", "utf8");
const { fiches, avertissements } = parseFicheSet(md);

describe("fiches réelles · Semaine 1 ADMIN (@canary)", () => {
  it("23 fiches numérotées 1 à 23, sans avertissement", () => {
    expect(avertissements).toEqual([]);
    expect(fiches.map((f) => f.numero)).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
    expect(fiches[12].titre).toBe("L’arrêt Cadot, aboutissement de la séparation");
  });

  it("chaque fiche a une thèse critique en premier point", () => {
    for (const f of fiches) {
      const [premier] = extractPoints(f.contenu);
      expect(premier, `fiche ${f.numero}`).toMatchObject({ etiquette: "Thèse", type: "critique" });
    }
  });

  it("aucun complément hors cours ne devient un point exigé", () => {
    for (const f of fiches) {
      for (const point of extractPoints(f.contenu)) {
        expect(point.etiquette.toLowerCase()).not.toContain("complément");
        expect(point.attendu).not.toMatch(/^\*\*Complément/);
      }
    }
  });

  it("fiche 3 : texte de loi critique, cause et conséquences en raisonnement", () => {
    const points = extractPoints(fiches[2].contenu);
    expect(points.find((p) => p.etiquette === "Texte")).toMatchObject({ type: "critique" });
    expect(points.filter((p) => p.raisonnement).map((p) => p.etiquette)).toEqual([
      "Cause",
      "Conséquence",
      "Conséquence",
    ]);
  });

  it("fiche 12 : le tableau retenue/déléguée donne une ligne par critère", () => {
    const lignes = extractPoints(fiches[11].contenu).filter((p) => p.etiquette === "Tableau");
    expect(lignes.map((p) => p.intitule)).toEqual(["Période", "Qui décide", "Rôle du Conseil d’État", "Nature du Conseil d’État"]);
    expect(lignes[1].attendu).toBe("Justice retenue : Le chef de l’État ; Justice déléguée : Le Conseil d’État");
  });
});
