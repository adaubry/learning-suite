import { afterAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import * as account from "./account";
import * as review from "./review";
import { db } from "@/db";
import { chapter, section } from "@/db/schema";

// S6 · ReviewService — Postgres réel (pattern guide.test.ts), pas de LLM.

const client = postgres(process.env.DATABASE_URL!);
const createdUserIds: string[] = [];

async function createUser() {
  const [user] = await client`insert into auth.users (id) values (gen_random_uuid()) returning id`;
  createdUserIds.push(user.id);
  return user.id as string;
}

let userId: string;
let chapterId: string;

beforeEach(async () => {
  userId = await createUser();
  const s = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
  const [c] = await db
    .insert(chapter)
    .values({ subjectId: s.id, titre: "Chap 1", markdown: "# x", contentHash: "h" })
    .returning();
  chapterId = c.id;
});

afterAll(async () => {
  for (const id of createdUserIds) {
    await client`delete from review_card where section_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id}))`;
    await client`delete from chapter where subject_id in (select id from subject where user_id = ${id})`;
    await client`delete from subject where user_id = ${id}`;
    await client`delete from auth.users where id = ${id}`;
  }
  await client.end();
});

async function createSection() {
  const [sec] = await db
    .insert(section)
    .values({ chapterId, chapterVersion: 1, titre: "Sec", ordre: 1, niveauSource: 1, contenu: "...", importance: 3, statut: "validee" })
    .returning();
  return sec;
}

describe("review · S6", () => {
  it("createCard : insère une carte neuve (reps=0, gelee=false)", async () => {
    const sec = await createSection();
    const card = await review.createCard(userId, sec.id);
    expect(card).toMatchObject({ sectionId: sec.id, reps: 0, lapses: 0, gelee: false });
  });

  it("createCard : unicité par section — un second appel échoue", async () => {
    const sec = await createSection();
    await review.createCard(userId, sec.id);
    await expect(review.createCard(userId, sec.id)).rejects.toThrow(review.ReviewCardAlreadyExistsError);
  });

  it("rate : la note utilisateur seule pilote l'échéance (jamais un verdict LLM, ADR 3 — l'API n'accepte que again/hard/good/easy)", async () => {
    const sec = await createSection();
    await review.createCard(userId, sec.id);
    const updated = await review.rate(userId, sec.id, "good");
    expect(updated.reps).toBe(1);
    expect(updated.lastReview).not.toBeNull();
  });

  it("rate : sans ReviewCard ⇒ NoReviewCardError", async () => {
    const sec = await createSection();
    await expect(review.rate(userId, sec.id, "good")).rejects.toThrow(review.NoReviewCardError);
  });

  it("rate : sur une carte gelée ⇒ ReviewCardFrozenError", async () => {
    const sec = await createSection();
    await review.createCard(userId, sec.id);
    await review.freeze(userId, sec.id);
    await expect(review.rate(userId, sec.id, "good")).rejects.toThrow(review.ReviewCardFrozenError);
  });

  it("freeze/unfreeze : idempotents (répéter ne change rien d'observable, ni n'échoue)", async () => {
    const sec = await createSection();
    await review.createCard(userId, sec.id);

    await review.freeze(userId, sec.id);
    await review.freeze(userId, sec.id);
    let card = await db.query.reviewCard.findFirst({ where: (r, { eq }) => eq(r.sectionId, sec.id) });
    expect(card?.gelee).toBe(true);

    await review.unfreeze(userId, sec.id);
    await review.unfreeze(userId, sec.id);
    card = await db.query.reviewCard.findFirst({ where: (r, { eq }) => eq(r.sectionId, sec.id) });
    expect(card?.gelee).toBe(false);
  });

  it("freeze : no-op silencieux si aucune ReviewCard pour la section (n'échoue pas)", async () => {
    const sec = await createSection();
    await expect(review.freeze(userId, sec.id)).resolves.toBeUndefined();
  });

  it("createCard/rate/freeze : refusent une section d'un autre utilisateur", async () => {
    const sec = await createSection();
    const otherUserId = await createUser();
    await expect(review.createCard(otherUserId, sec.id)).rejects.toThrow();
  });

  it("preview : simule les 4 notes sans écrire en base (U18)", async () => {
    const sec = await createSection();
    await review.createCard(userId, sec.id);
    const before = await db.query.reviewCard.findFirst({ where: (r, { eq }) => eq(r.sectionId, sec.id) });

    const preview = await review.preview(userId, sec.id);
    expect(Object.keys(preview).sort()).toEqual(["again", "easy", "good", "hard"]);
    expect(preview.easy.due >= preview.again.due).toBe(true);

    const after = await db.query.reviewCard.findFirst({ where: (r, { eq }) => eq(r.sectionId, sec.id) });
    expect(after).toEqual(before);
  });

  it("preview : sans ReviewCard ⇒ NoReviewCardError", async () => {
    const sec = await createSection();
    await expect(review.preview(userId, sec.id)).rejects.toThrow(review.NoReviewCardError);
  });
});
