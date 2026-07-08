import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { correctBlurting } from "./correctBlurting";
import type { CorrectionContext } from "@/llm/context/correction";

// @canary FUNCTIONS §2 L3 : couverture incomplète du diff ⇒ rejet + retry (bout en
// bout via callLLM, LLM mocké, PromptLog réel).

const client = postgres(process.env.DATABASE_URL!);

const context: CorrectionContext = {
  points: [
    { intitule: "Point 1", attendu: "Attendu 1" },
    { intitule: "Point 2", attendu: "Attendu 2" },
  ],
  blurting: "Ma restitution.",
  tentative: 1,
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
  process.env.LLM_MODEL_CORRECTION_ERREURS = "test/correctBlurting";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await client`delete from prompt_log where model = 'test/correctBlurting'`;
  await client.end();
});

describe("correctBlurting", () => {
  it("rejette un diff incomplet (point 2 omis) puis réussit au retry", async () => {
    const incomplet = { diff: [{ point_index: 1, statut: "couvert", explication: "ok" }], erreurs_candidates: [] };
    const complet = {
      diff: [
        { point_index: 1, statut: "couvert", explication: "ok" },
        { point_index: 2, statut: "manquant", explication: "absent" },
      ],
      erreurs_candidates: [],
    };

    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockResponse(incomplet))
      .mockResolvedValueOnce(mockResponse(complet));

    const result = await correctBlurting(context);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.diff.map((d) => d.point_index).sort()).toEqual([1, 2]);
  });

  it("rejette un recidive_index hors bornes puis réussit au retry", async () => {
    const contextAvecErreur: CorrectionContext = { ...context, erreursActives: [{ type: "confusion", description: "x" }] };
    const invalide = {
      diff: [
        { point_index: 1, statut: "couvert", explication: "ok" },
        { point_index: 2, statut: "couvert", explication: "ok" },
      ],
      erreurs_candidates: [{ type: "confusion", description: "y", recidive_index: 5 }],
    };
    const valide = {
      diff: [
        { point_index: 1, statut: "couvert", explication: "ok" },
        { point_index: 2, statut: "couvert", explication: "ok" },
      ],
      erreurs_candidates: [{ type: "confusion", description: "y", recidive_index: 1 }],
    };

    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockResponse(invalide))
      .mockResolvedValueOnce(mockResponse(valide));

    const result = await correctBlurting(contextAvecErreur);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.erreurs_candidates[0].recidive_index).toBe(1);
  });
});
