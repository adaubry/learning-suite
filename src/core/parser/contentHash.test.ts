import { describe, expect, it } from "vitest";
import { computeContentHash } from "./contentHash";

describe("computeContentHash", () => {
  it("est déterministe : deux exports identiques donnent le même hash", () => {
    const markdown = "# Chapitre\n\n**Important.**\n";
    expect(computeContentHash(markdown)).toBe(computeContentHash(markdown));
  });

  it("ignore les différences de fins de ligne (CRLF vs LF)", () => {
    const lf = "# Chapitre\n\nTexte du cours.\n";
    const crlf = lf.replace(/\n/g, "\r\n");
    expect(computeContentHash(lf)).toBe(computeContentHash(crlf));
  });

  it("ignore les espaces finaux de ligne insignifiants", () => {
    const withoutTrailing = "# Chapitre\n\nTexte du cours.\n";
    const withTrailing = "# Chapitre   \n\nTexte du cours.\n";
    expect(computeContentHash(withoutTrailing)).toBe(computeContentHash(withTrailing));
  });

  it("détecte un vrai changement de contenu", () => {
    const before = "# Chapitre\n\nTexte du cours.\n";
    const after = "# Chapitre\n\nTexte du cours modifié.\n";
    expect(computeContentHash(before)).not.toBe(computeContentHash(after));
  });
});
