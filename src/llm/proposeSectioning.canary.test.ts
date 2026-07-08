import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { parseChapter } from "@/core/parser/parseChapter";
import { proposeSectioning } from "./proposeSectioning";

// @canary FUNCTIONS §2 L1 : bornes incohérentes (trou/chevauchement dans la
// couverture du plan) ⇒ rejet + retry (bout en bout via callLLM, LLM mocké).

const client = postgres(process.env.DATABASE_URL!);

const md = "# Chapitre\n\n## Un\n\ntexte un\n\n## Deux\n\ntexte deux\n\n## Trois\n\ntexte trois\n";

beforeEach(() => {
  process.env.LLM_MODEL_SECTIONNEMENT = "test/proposeSectioning-canary";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await client`delete from prompt_log where model = 'test/proposeSectioning-canary'`;
  await client.end();
});

function mockResponse(content: unknown) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }),
  };
}

describe("proposeSectioning · couverture incohérente", () => {
  it("rejette une couverture avec un trou puis réussit au retry", async () => {
    const troué = {
      sections: [
        { debut_index: 1, fin_index: 1, titre_labelise: "Un", justification: "x" },
        { debut_index: 3, fin_index: 3, titre_labelise: "Trois", justification: "x" },
      ],
    };
    const complet = {
      sections: [
        { debut_index: 1, fin_index: 1, titre_labelise: "Un", justification: "x" },
        { debut_index: 2, fin_index: 2, titre_labelise: "Deux", justification: "x" },
        { debut_index: 3, fin_index: 3, titre_labelise: "Trois", justification: "x" },
      ],
    };
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockResponse(troué))
      .mockResolvedValueOnce(mockResponse(complet));

    const { titleTree, italicSegments } = parseChapter(md);
    const sections = await proposeSectioning({
      markdown: md,
      titleTree,
      italicSegments,
      matiere: "Droit civil",
      chapitre: "Chapitre 1",
      methodologieTitres: "méthodologie",
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sections).toHaveLength(3);
    const secondCallBody = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body);
    expect(secondCallBody.messages[0].content).toContain("Erreur de la tentative précédente");
  });
});
