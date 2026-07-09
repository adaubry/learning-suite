import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { transcribeAudio } from "./transcribeAudio";
import type { TranscriptionContext } from "@/llm/context/transcription";

// @canary PLAN Bloc 7.1, FUNCTIONS L6 : l'audio transite en base64 dans la requête
// (content-type input_audio), jamais ailleurs — aucune colonne PromptLog ni
// argument de persistance ; « détruit » = jamais écrit, pas un cleanup à part.

const client = postgres(process.env.DATABASE_URL!);

const context: TranscriptionContext = { glossaire: ["Les conditions générales", "article 1119"] };

function mockResponse(content: string) {
  return {
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }),
  };
}

beforeEach(() => {
  process.env.LLM_MODEL_TRANSCRIPTION = "test/transcribeAudio";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await client`delete from prompt_log where model = 'test/transcribeAudio'`;
  await client.end();
});

describe("transcribeAudio", () => {
  it("envoie l'audio en input_audio et retourne le transcript, sans champ de persistance", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse("Article 1119 du Code civil."));

    const result = await transcribeAudio(context, "QUJD", "mp3");

    expect(result).toBe("Article 1119 du Code civil.");
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(Object.keys(body).sort()).toEqual(["messages", "model"]);
    expect(body.messages[0].content[1]).toEqual({
      type: "input_audio",
      input_audio: { data: "QUJD", format: "mp3" },
    });

    const rows = await client`select * from prompt_log where model = 'test/transcribeAudio'`;
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).not.toContain("audio");
  });
});
