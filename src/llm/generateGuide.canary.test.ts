import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { generateGuide } from "./generateGuide";
import type { RubriqueContext } from "@/llm/context/rubrique";

// @canary FUNCTIONS §2 L2 : rubrique sans point critique ⇒ rejet + retry (bout en
// bout via callLLM, LLM mocké, PromptLog réel).

const client = postgres(process.env.DATABASE_URL!);

const context: RubriqueContext = {
  matiere: "Droit civil",
  chapitre: "Chapitre 1",
  titreSection: "Section 1",
  contenu: "Contenu.",
  segmentsGras: ["important"],
  commentaires: [],
  erreursActives: [],
};

function mockResponse(content: unknown) {
  return {
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }),
  };
}

beforeEach(() => {
  process.env.LLM_MODEL_RUBRIQUE = "test/generateGuide";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await client`delete from prompt_log where model = 'test/generateGuide'`;
  await client.end();
});

describe("generateGuide", () => {
  it("rejette une rubrique sans point critique puis réussit au retry", async () => {
    const sansCritique = { points: [{ type: "secondaire", intitule: "x", attendu: "y", segments_couverts: [1] }] };
    const avecCritique = { points: [{ type: "critique", intitule: "x", attendu: "y", segments_couverts: [1] }] };

    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockResponse(sansCritique))
      .mockResolvedValueOnce(mockResponse(avecCritique));

    const result = await generateGuide(context);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.points.some((p) => p.type === "critique")).toBe(true);
  });

  it("rejette une rubrique qui ne couvre pas tous les segments gras puis réussit au retry", async () => {
    const incomplete = { points: [{ type: "critique", intitule: "x", attendu: "y", segments_couverts: [] }] };
    const complete = { points: [{ type: "critique", intitule: "x", attendu: "y", segments_couverts: [1] }] };

    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockResponse(incomplete))
      .mockResolvedValueOnce(mockResponse(complete));

    const result = await generateGuide(context);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.points[0].segments_couverts).toEqual([1]);
  });
});
