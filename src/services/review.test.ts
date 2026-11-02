import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as review from "./review";
import { client, cleanupAll, seedSet, createUser } from "@/test/fixtures";

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

function isoDaysFromNow(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describe("review", () => {
  it("createCard : carte neuve (reps=0, gelee=false), une seule par fiche", async () => {
    const c = await review.createCard(userId, ficheId);
    expect(c).toMatchObject({ reps: 0, gelee: false, ficheId });
    await expect(review.createCard(userId, ficheId)).rejects.toThrow(review.ReviewCardAlreadyExistsError);
  });

  it("rate : sans carte ⇒ NoReviewCardError", async () => {
    await expect(review.rate(userId, ficheId, "good")).rejects.toThrow(review.NoReviewCardError);
  });

  it("rate : la note fait avancer l'échéance (good plus loin que again)", async () => {
    await review.createCard(userId, ficheId);
    const good = await review.rate(userId, ficheId, "good");
    expect(good.reps).toBe(1);
    expect(good.due > isoDaysFromNow(0)).toBe(true);
  });

  it("unfreeze : frozenSince décale due de la durée écoulée, sans toucher l'état FSRS", async () => {
    await review.createCard(userId, ficheId);
    await review.rate(userId, ficheId, "good");
    const avant = await card();
    await review.freeze([ficheId]);

    const dixJours = new Date(Date.now() - 10 * 86_400_000);
    await review.unfreeze([ficheId], dixJours);
    const apres = await card();

    const attendu = new Date(`${avant.due}T00:00:00Z`);
    attendu.setUTCDate(attendu.getUTCDate() + 10);
    expect(apres.due).toBe(attendu.toISOString().slice(0, 10));
    expect(apres).toMatchObject({
      gelee: false,
      stability: avant.stability,
      difficulty: avant.difficulty,
      reps: avant.reps,
      lapses: avant.lapses,
    });
  });

  it("freeze/unfreeze : no-op sans carte ni liste vide", async () => {
    await expect(review.freeze([ficheId])).resolves.toBeUndefined();
    await expect(review.freeze([])).resolves.toBeUndefined();
    await expect(review.unfreeze([])).resolves.toBeUndefined();
  });

  it("refuse une fiche d'un autre utilisateur", async () => {
    const autre = await createUser();
    await expect(review.createCard(autre, ficheId)).rejects.toThrow();
    await expect(review.preview(autre, ficheId)).rejects.toThrow();
  });

  it("preview : simule les 4 notes sans écrire, même sans carte", async () => {
    const p = await review.preview(userId, ficheId);
    expect(Object.keys(p).sort()).toEqual(["again", "easy", "good", "hard"]);
    expect(await card()).toBeUndefined();
    expect(p.easy.due >= p.good.due).toBe(true);
  });

  it("createOrRate : crée puis note ; sur carte existante, note sans recréer", async () => {
    const a = await review.createOrRate(userId, ficheId, "good");
    expect(a.reps).toBe(1);
    const b = await review.createOrRate(userId, ficheId, "hard");
    expect(b.reps).toBe(2);
    const rows = await client`select id from review_card where fiche_id = ${ficheId}`;
    expect(rows).toHaveLength(1);
  });
});
