import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as review from "./review";
import { client, cleanupAll, seedSet } from "@/test/fixtures";
import type { Note } from "@/core/fsrs/fsrsCore";

// @canary — « la note FSRS vient de l'utilisateur, jamais du verdict » (assertion
// d'API) et « gel/dégel idempotents ». Un canari rouge invalide la modification
// qui l'a cassé, jamais l'inverse (AGENTS §2.5).

let userId: string;
let ficheId: string;

beforeEach(async () => {
  const s = await seedSet();
  userId = s.userId;
  ficheId = s.fiches[0].id;
});

afterAll(cleanupAll);

async function card() {
  const [row] = await client`select *, due::text as due from review_card where fiche_id = ${ficheId}`;
  return row;
}

describe("review (@canary)", () => {
  it("la note FSRS vient de l'utilisateur, jamais du verdict — rate() n'admet que again/hard/good/easy", async () => {
    await review.createCard(userId, ficheId);
    await expect(review.rate(userId, ficheId, "good")).resolves.toMatchObject({ reps: 1 });
    await expect(review.rate(userId, ficheId, "bon" as unknown as Note)).rejects.toThrow();
    await expect(review.rate(userId, ficheId, "insuffisant" as unknown as Note)).rejects.toThrow();
  });

  it("gel/dégel idempotents — répéter ne change rien au-delà de l'état stable", async () => {
    await review.createCard(userId, ficheId);
    const avant = (await card()).due;

    await review.freeze([ficheId]);
    await review.freeze([ficheId]);
    expect((await card()).gelee).toBe(true);
    await expect(review.rate(userId, ficheId, "good")).rejects.toThrow(review.ReviewCardFrozenError);

    await review.unfreeze([ficheId]);
    await review.unfreeze([ficheId]);
    const apres = await card();
    expect(apres.gelee).toBe(false);
    expect(apres.due).toBe(avant);
  });
});
