import { describe, expect, it } from "vitest";
import { buildTranscriptionContext } from "./transcription";

// @canary L0/L6 : le glossaire ne contient que titre + gras — jamais le contenu
// complet de la section (ARCHITECTURE §9 ligne 6, FUNCTIONS L6).

describe("buildTranscriptionContext", () => {
  it("n'expose exactement que la clé glossaire", () => {
    const context = buildTranscriptionContext({
      section: {
        titre: "Les conditions générales",
        segmentsGras: [{ text: "article 1119", start: 0, end: 12, ambiguous: false }],
      },
    });

    expect(Object.keys(context)).toEqual(["glossaire"]);
  });

  it("compose le glossaire depuis le titre puis les segments gras, sans positions ni métadonnées", () => {
    const context = buildTranscriptionContext({
      section: {
        titre: "Les conditions générales",
        segmentsGras: [
          { text: "article 1119", start: 0, end: 12, ambiguous: false },
          { text: "stipulations non négociables", start: 50, end: 79, ambiguous: true },
        ],
      },
    });

    expect(context.glossaire).toEqual([
      "Les conditions générales",
      "article 1119",
      "stipulations non négociables",
    ]);
  });
});
