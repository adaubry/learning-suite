import { describe, expect, it } from "vitest";
import { parseFicheSet, ficheContentHash } from "./parseFicheSet";

describe("parseFicheSet", () => {
  it("découpe par titre 2 et lit numéro + titre", () => {
    const { fiches, avertissements } = parseFicheSet(
      "## 1. Première\n\nThèse une.\n\n### Sous-partie\n\n- **Cause :** x\n\n## 2. Seconde\n\nThèse deux.\n",
    );
    expect(avertissements).toEqual([]);
    expect(fiches.map((f) => [f.numero, f.titre])).toEqual([
      [1, "Première"],
      [2, "Seconde"],
    ]);
    expect(fiches[0].contenu).toBe("Thèse une.\n\n### Sous-partie\n\n- **Cause :** x");
    expect(fiches[1].contenu).toBe("Thèse deux.");
  });

  it("accepte le titre exporté par Google Docs (gras, point échappé)", () => {
    const { fiches } = parseFicheSet("## **13\\. L'arrêt Cadot**\n\nThèse.\n");
    expect(fiches[0]).toMatchObject({ numero: 13, titre: "L'arrêt Cadot" });
  });

  it("sans numéro : position dans le document, avec avertissement", () => {
    const { fiches, avertissements } = parseFicheSet("## Alpha\n\nx\n\n## Beta\n\ny\n");
    expect(fiches.map((f) => f.numero)).toEqual([1, 2]);
    expect(avertissements).toHaveLength(2);
  });

  it("signale le texte avant la première fiche (un titre 1 seul est toléré)", () => {
    expect(parseFicheSet("# Set\n\n## 1. A\n\nx\n").avertissements).toEqual([]);
    expect(parseFicheSet("Intro libre\n\n## 1. A\n\nx\n").avertissements).toHaveLength(1);
  });

  it("signale les numéros en double", () => {
    const { avertissements } = parseFicheSet("## 1. A\n\nx\n\n## 1. B\n\ny\n");
    expect(avertissements).toEqual(["Numéro 1 utilisé par plusieurs fiches."]);
  });

  it("aucune fiche si aucun titre 2", () => {
    expect(parseFicheSet("# Titre\n\nTexte\n").fiches).toEqual([]);
  });

  it("empreinte stable aux variations d'export, sensible au fond et au titre", () => {
    const a = ficheContentHash("T", "- **Cause :** x\n- y");
    expect(ficheContentHash("T", "*   **Cause :** x\r\n*   y\r\n")).toBe(a);
    expect(ficheContentHash("T", "- **Cause :** z\n- y")).not.toBe(a);
    expect(ficheContentHash("T2", "- **Cause :** x\n- y")).not.toBe(a);
  });
});
