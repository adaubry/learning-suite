import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFicheSet } from "./parseFicheSet";
import { extractPoints } from "./extractPoints";

// @canary — vrai export Markdown Google Docs d'un set de fiches de l'utilisateur
// (« Les grandes notions du droit administratif »), tel quel : titres en gras,
// numéros échappés (`1\.`), et un `## ` vide entre les fiches (le paragraphe de
// saut de page — une fiche = une page). Ces titres vides avaient fait compter
// 16 fiches au lieu de 9.

const md = readFileSync("e2e/evals/fixtures/Les grandes notions du droit administratif.md", "utf8");
const { fiches, avertissements } = parseFicheSet(md);

describe("export Google Docs · Les grandes notions (@canary)", () => {
  it("9 fiches numérotées 1 à 9, sans avertissement", () => {
    expect(avertissements).toEqual([]);
    expect(fiches.map((f) => f.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(fiches[5].titre).toBe("« Rapports entre personnes privées » VS « Rapports impliquant l’administration »");
  });

  it("aucun corps de fiche ne contient de titre 2", () => {
    for (const f of fiches) expect(f.contenu, `fiche ${f.numero}`).not.toMatch(/^## /m);
  });

  it("chaque fiche a des points ; aucun intitulé vide", () => {
    for (const f of fiches) {
      const points = extractPoints(f.contenu);
      expect(points.length, `fiche ${f.numero}`).toBeGreaterThan(0);
      for (const p of points) expect(p.intitule.trim()).not.toBe("");
    }
  });
});
