import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { parseChapter } from "@/core/parser/parseChapter";
import { AucunTitreExploitableError, proposeSectioning } from "./proposeSectioning";

const client = postgres(process.env.DATABASE_URL!);

beforeEach(() => {
  process.env.LLM_MODEL_SECTIONNEMENT = "test/proposeSectioning";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await client`delete from prompt_log where model = 'test/proposeSectioning'`;
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

describe("proposeSectioning", () => {
  it("résout les bornes depuis les indices du plan, sans comptage de caractères par le modèle", async () => {
    const md = "# Chapitre\n\n## Un\n\ntexte un\n\n## Deux\n\ntexte deux\n";
    const { titleTree, italicSegments } = parseChapter(md);

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse({
        sections: [
          { debut_index: 1, fin_index: 1, titre_labelise: "Un", justification: "seule" },
          { debut_index: 2, fin_index: 2, titre_labelise: "Deux", justification: "seule" },
        ],
      }),
    );

    const sections = await proposeSectioning({
      markdown: md,
      titleTree,
      italicSegments,
      matiere: "Droit civil",
      chapitre: "Chapitre 1",
      methodologieTitres: "méthodologie",
    });

    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({ titre: "Un" });
    expect(sections[1]).toMatchObject({ titre: "Deux" });
    expect(sections[0].end).toBe(sections[1].start - 1);
    expect(sections[1].end).toBe(md.length);
  });

  it("échoue immédiatement sans aucun titre exploitable (secours P6 à l'appelant)", async () => {
    const md = "juste du texte, sans titre.\n";
    const { titleTree, italicSegments } = parseChapter(md);

    await expect(
      proposeSectioning({
        markdown: md,
        titleTree,
        italicSegments,
        matiere: "Droit civil",
        chapitre: "Chapitre 1",
        methodologieTitres: "méthodologie",
      }),
    ).rejects.toThrow(AucunTitreExploitableError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
