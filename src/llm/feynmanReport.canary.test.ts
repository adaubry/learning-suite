import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { feynmanReport } from "./feynmanReport";
import type { FeynmanBilanContext } from "@/llm/context/feynmanBilan";

// @canary FUNCTIONS §2 L5 : couverture incomplète du bilan ⇒ rejet + retry (bout
// en bout via callLLM, LLM mocké, PromptLog réel) — même garantie que L3.

const client = postgres(process.env.DATABASE_URL!);

const context: FeynmanBilanContext = {
  points: [
    { intitule: "Point 1", attendu: "Attendu 1" },
    { intitule: "Point 2", attendu: "Attendu 2" },
  ],
  historique: [
    { role: "ia", texte: "Explique la notion." },
    { role: "etudiant", texte: "Voici mon explication." },
  ],
};

function mockResponse(content: unknown) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }),
  };
}

beforeEach(() => {
  process.env.LLM_MODEL_FEYNMAN = "test/feynmanReport";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await client`delete from prompt_log where model = 'test/feynmanReport'`;
  await client.end();
});

describe("feynmanReport", () => {
  it("rejette un bilan incomplet (point 2 omis) puis réussit au retry", async () => {
    const incomplet = {
      points: [{ point_index: 1, statut: "demontre", commentaire: "ok" }],
      points_solides: [],
      lacunes: [],
    };
    const complet = {
      points: [
        { point_index: 1, statut: "demontre", commentaire: "ok" },
        { point_index: 2, statut: "recite", commentaire: "manque le pourquoi" },
      ],
      points_solides: ["Point 1"],
      lacunes: ["Point 2 : récité sans explication"],
    };

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse(incomplet)).mockResolvedValueOnce(mockResponse(complet));

    const result = await feynmanReport(context);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.points.map((p) => p.point_index).sort()).toEqual([1, 2]);

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.messages[0].content).toContain("Point 1 — attendu : Attendu 1");
    expect(body.messages[0].content).toContain("Étudiant : Voici mon explication.");
  });
});
