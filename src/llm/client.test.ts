import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import postgres from "postgres";
import { callLLM, LLMValidationError } from "./client";

// L0 · callLLM — LLM toujours mocké (fetch intercepté), Postgres réel pour PromptLog
// (même doctrine que chapter.test.ts/account.test.ts).

const client = postgres(process.env.DATABASE_URL!);

beforeEach(() => {
  process.env.LLM_MODEL_RUBRIQUE = "test/model";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await client`delete from prompt_log where model = 'test/model'`;
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
