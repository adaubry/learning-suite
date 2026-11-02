import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as session from "./session";
import { client, cleanupAll, seedSet } from "@/test/fixtures";

// @canary — invariants du cycle (ARCHITECTURE.md v2 §2, §8) : une seule session
// ouverte ; ≤ 2 blurtings ; après relecture la note est Again ou Hard (le rappel
// à froid a échoué). Un canari rouge invalide la modification qui l'a cassé,
// jamais l'inverse (AGENTS §2.5).

const MODEL = "test/session-canary";

const reply = {
  ok: true,
  json: async () => ({
    choices: [
      {
        message: {
          content: JSON.stringify({
            diff: [1, 2, 3].map((i) => ({ point_index: i, statut: "couvert", explication: "x" })),
            erreurs_candidates: [],
          }),
        },
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  }),
};

let userId: string;
let fiches: { id: string }[];

beforeEach(async () => {
  process.env.LLM_MODEL_CORRECTION_ERREURS = MODEL;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply));
  const s = await seedSet();
  userId = s.userId;
  fiches = s.fiches;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await client`delete from prompt_log where model = ${MODEL}`;
  await cleanupAll();
});

async function deuxPasses(ficheId: string) {
  const cycle = await session.start(userId, ficheId);
  await session.terminerLecture(userId, cycle.id);
  await session.submitBlurting(userId, cycle.id, "première");
  await session.relire(userId, cycle.id);
  await session.terminerLecture(userId, cycle.id);
  await session.submitBlurting(userId, cycle.id, "seconde");
  return cycle.id;
}

describe("session (@canary)", () => {
  it("après relecture, seules Again et Hard sont acceptées", async () => {
    const cycleId = await deuxPasses(fiches[0].id);
    expect(await session.notesPermises(cycleId)).toEqual(["again", "hard"]);
    await expect(session.noter(userId, cycleId, "good")).rejects.toThrow(session.WrongCycleStateError);
    await expect(session.noter(userId, cycleId, "easy")).rejects.toThrow(session.WrongCycleStateError);
    await expect(session.noter(userId, cycleId, "hard")).resolves.toBeUndefined();
  });

  it("deux blurtings maximum : pas de 3ᵉ passe", async () => {
    const cycleId = await deuxPasses(fiches[0].id);
    await expect(session.relire(userId, cycleId)).rejects.toThrow(session.WrongCycleStateError);
    await client`update study_cycle set etat = 'blurting' where id = ${cycleId}`;
    await expect(session.submitBlurting(userId, cycleId, "troisième")).rejects.toThrow(session.WrongCycleStateError);
  });

  it("une seule session ouverte par utilisateur", async () => {
    await session.start(userId, fiches[0].id);
    await expect(session.start(userId, fiches[1].id)).rejects.toThrow(session.SessionAlreadyOpenError);
  });
});
