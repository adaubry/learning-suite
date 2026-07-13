import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import postgres from "postgres";
import { callLLM, callTranscription, streamCompletion, LLMValidationError } from "./client";

// L0 · callLLM — LLM toujours mocké (fetch intercepté), Postgres réel pour PromptLog
// (même doctrine que chapter.test.ts/account.test.ts).

const client = postgres(process.env.DATABASE_URL!);

beforeEach(() => {
  process.env.LLM_MODEL_RUBRIQUE = "test/model";
  process.env.LLM_MODEL_TRANSCRIPTION = "test/model-transcription";
  process.env.LLM_MODEL_FEYNMAN = "test/model-feynman";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await client`delete from prompt_log where model in ('test/model', 'test/model-transcription', 'test/model-feynman')`;
  delete process.env.LLM_MODEL_TRANSCRIPTION;
  delete process.env.LLM_MODEL_FEYNMAN;
  await client.end();
});

const schema = z.object({ value: z.number() });

function mockResponse(content: unknown) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
  };
}

function mockTextResponse(content: string) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 3, completion_tokens: 2 },
    }),
  };
}

describe("callTranscription", () => {
  it("retourne le transcript et envoie l'audio en content-type input_audio", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockTextResponse("Article 1119 du Code civil."));

    const result = await callTranscription({
      promptVersion: "v1",
      context: { glossaire: ["Les conditions générales"] },
      audioBase64: "QUJD",
      audioFormat: "mp3",
    });

    expect(result).toBe("Article 1119 du Code civil.");
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.messages[0].content[1]).toEqual({
      type: "input_audio",
      input_audio: { data: "QUJD", format: "mp3" },
    });

    const rows = await client`select * from prompt_log where model = 'test/model-transcription'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].statut).toBe("ok");
  });

  it("retente sur transcript vide puis réussit", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockTextResponse("   "))
      .mockResolvedValueOnce(mockTextResponse("Bon transcript."));

    const result = await callTranscription({
      promptVersion: "v1",
      context: { glossaire: [] },
      audioBase64: "QUJD",
      audioFormat: "mp3",
    });

    expect(result).toBe("Bon transcript.");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("échec définitif après épuisement des retries", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockTextResponse(""));

    await expect(
      callTranscription({
        promptVersion: "v1",
        context: { glossaire: [] },
        audioBase64: "QUJD",
        audioFormat: "mp3",
        maxRetries: 1,
      }),
    ).rejects.toThrow(LLMValidationError);

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

function mockStreamResponse(deltas: string[], usage = { prompt_tokens: 5, completion_tokens: 3 }) {
  const lines = [
    ...deltas.map((d) => `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`),
    `data: ${JSON.stringify({ choices: [{ delta: {} }], usage })}\n\n`,
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

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  let full = "";
  for await (const chunk of gen) full += chunk;
  return full;
}

describe("streamCompletion", () => {
  it("yield les deltas et journalise l'usage à la fin du flux", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockStreamResponse(["Bon", "jour"]));

    const text = await collect(
      streamCompletion({ appel: "feynman", promptVersion: "v2", promptFile: "feynman_turn", context: {} }),
    );

    expect(text).toBe("Bonjour");
    const rows = await client`select * from prompt_log where model = 'test/model-feynman'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].statut).toBe("ok");
    expect(rows[0].output_tokens).toBe(3);
  });

  it("échoue si le flux ne contient aucun delta", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockStreamResponse([]));

    await expect(
      collect(streamCompletion({ appel: "feynman", promptVersion: "v2", promptFile: "feynman_turn", context: {} })),
    ).rejects.toThrow(LLMValidationError);
  });

  it("échoue sur une réponse HTTP non-2xx, sans retry", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: "boom" } }),
    });

    await expect(
      collect(streamCompletion({ appel: "feynman", promptVersion: "v2", promptFile: "feynman_turn", context: {} })),
    ).rejects.toThrow(/boom/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("callLLM", () => {
  it("retourne la donnée validée dès le premier succès", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse({ value: 42 }));

    const result = await callLLM({
      appel: "rubrique",
      promptVersion: "v1",
      schema,
      context: { foo: "bar" },
    });

    expect(result).toEqual({ value: 42 });
    expect(fetch).toHaveBeenCalledTimes(1);

    const rows = await client`select * from prompt_log where model = 'test/model'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].statut).toBe("ok");
  });

  it("retry avec réinjection sur erreur de schéma puis réussit", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockResponse({ value: "pas un nombre" }))
      .mockResolvedValueOnce(mockResponse({ value: 7 }));

    const result = await callLLM({
      appel: "rubrique",
      promptVersion: "v1",
      schema,
      context: { foo: "bar" },
    });

    expect(result).toEqual({ value: 7 });
    expect(fetch).toHaveBeenCalledTimes(2);
    const secondCallBody = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body);
    expect(secondCallBody.messages[0].content).toContain("Erreur de la tentative précédente");
  });

  it("retry sur échec de validation métier", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockResponse({ value: 1 }))
      .mockResolvedValueOnce(mockResponse({ value: 2 }));

    const result = await callLLM({
      appel: "rubrique",
      promptVersion: "v1",
      schema,
      context: {},
      validate: (data) => (data.value < 2 ? "value trop petite" : null),
    });

    expect(result).toEqual({ value: 2 });
  });

  it("échec définitif après épuisement des retries", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({ value: "toujours invalide" }));

    await expect(
      callLLM({ appel: "rubrique", promptVersion: "v1", schema, context: {}, maxRetries: 1 }),
    ).rejects.toThrow(LLMValidationError);

    expect(fetch).toHaveBeenCalledTimes(2);
    const rows = await client`
      select statut from prompt_log where model = 'test/model' order by created_at desc limit 2
    `;
    expect(rows.map((r) => r.statut)).toEqual(["echec", "retry"]);
  });

  it("retente sans réinjection sur échec réseau puis réussit", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("connexion refusée"))
      .mockResolvedValueOnce(mockResponse({ value: 9 }));

    const result = await callLLM({
      appel: "rubrique",
      promptVersion: "v1",
      schema,
      context: { foo: "bar" },
    });

    expect(result).toEqual({ value: 9 });
    const secondCallBody = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body);
    expect(secondCallBody.messages[0].content).not.toContain("Erreur de la tentative précédente");
  });

  it("retente sur réponse HTTP non-2xx puis échoue avec le message d'erreur d'OpenRouter", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "rate limited" } }),
    });

    await expect(
      callLLM({ appel: "rubrique", promptVersion: "v1", schema, context: {}, maxRetries: 1 }),
    ).rejects.toThrow(/rate limited/);

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
