import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as session from "./session";
import { client, cleanupAll, seedSet } from "@/test/fixtures";

// @canary — invariants du cycle (ARCHITECTURE.md v2 §2, §8) : une seule session
// ouverte ; ≤ 2 blurtings ; la note reste libre après relecture (décision de
// l'humain, DECISIONS.md 2026-11-02, qui remplace « Again/Hard seulement »). Un canari rouge invalide la modification qui l'a cassé,
// jamais l'inverse (AGENTS §2.4).

let userId: string;
let fiches: { id: string }[];

beforeEach(async () => {
  const s = await seedSet();
  userId = s.userId;
  fiches = s.fiches;
});

afterAll(async () => {
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
  it("après relecture, les 4 notes restent acceptées ; la 1ʳᵉ passe est rappelée", async () => {
    const cycleId = await deuxPasses(fiches[0].id);
    expect((await session.getComparaison(userId, cycleId)).verdictPremierePasse).toBe("insuffisant");
    await expect(session.noter(userId, cycleId, "good")).resolves.toBeUndefined();
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
