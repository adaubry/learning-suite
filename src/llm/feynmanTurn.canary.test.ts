import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { feynmanTurn } from "./feynmanTurn";
import type { FeynmanTurnContext } from "@/llm/context/feynmanTurn";

// @canary FUNCTIONS §2 L4 : le tour streame bien le texte libre, jamais de
// contenu de section en dur dans la question elle-même (pas testable via mock —
// couvert par le canary du ContextBuilder). Ici : forme de la requête + relais fidèle.

const client = postgres(process.env.DATABASE_URL!);

const context: FeynmanTurnContext = {
  points: [{ intitule: "Point", attendu: "Attendu", piegeAssocie: null }],
  contenuSection: "Contenu complet de la section.",
  erreursActives: [],
  historique: [{ role: "ia", texte: "Explique la notion." }],
  dernierTranscript: "Voici mon explication.",
};

function mockStreamResponse(deltas: string[]) {
  const lines = [
    ...deltas.map((d) => `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`),
    `data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 2, completion_tokens: 2 } })}\n\n`,
    "data: [DONE]\n\n",
  ];
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
  return { ok: true, body };
}

beforeEach(() => {
  process.env.LLM_MODEL_FEYNMAN = "test/feynmanTurn";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await client`delete from prompt_log where model = 'test/feynmanTurn'`;
  await client.end();
});

describe("feynmanTurn", () => {
  it("streame la relance et envoie le contexte formaté en snake_case", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockStreamResponse(["Pourquoi ", "cette ", "règle ?"]));

    let full = "";
    for await (const chunk of feynmanTurn(context)) full += chunk;

    expect(full).toBe("Pourquoi cette règle ?");
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.messages[0].content).toContain("Point — attendu : Attendu");
    expect(body.messages[0].content).toContain("IA : Explique la notion.");
    expect(body.stream).toBe(true);
  });
});
