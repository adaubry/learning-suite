import { afterAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import * as account from "./account";
import * as review from "./review";
import { db } from "@/db";
import { chapter, section } from "@/db/schema";
import type { Note } from "@/core/fsrs/fsrsCore";

// @canary — PLAN.md Phase 6 (Bloc 6.2) : « la note FSRS vient de l'utilisateur,
// jamais du verdict » (assertion d'API) et « gel/dégel idempotents ». Figés avec
// l'humain avant écriture (récitation Bloc 6.2) — un canari rouge invalide la
// modification qui l'a cassé, jamais l'inverse (AGENTS §2.5).

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

describe("review · S6 (@canary)", () => {
  it("la note FSRS vient de l'utilisateur, jamais du verdict — rate() n'admet que again/hard/good/easy, le vocabulaire du verdict LLM (acquis/insuffisant) est rejeté à l'exécution", async () => {
    const sec = await createSection();
    await review.createCard(userId, sec.id);

    await expect(review.rate(userId, sec.id, "good")).resolves.toMatchObject({ reps: 1 });
    await expect(review.rate(userId, sec.id, "acquis" as unknown as Note)).rejects.toThrow();
    await expect(review.rate(userId, sec.id, "insuffisant" as unknown as Note)).rejects.toThrow();
  });

  it("gel/dégel idempotents — répéter freeze (ou unfreeze) ne change rien d'observable au-delà de l'état stable", async () => {
    const sec = await createSection();
    await review.createCard(userId, sec.id);

    await review.freeze(userId, sec.id);
    await review.freeze(userId, sec.id);
    await review.freeze(userId, sec.id);
    let card = await db.query.reviewCard.findFirst({ where: (r, { eq }) => eq(r.sectionId, sec.id) });
    expect(card?.gelee).toBe(true);

    await review.unfreeze(userId, sec.id);
    await review.unfreeze(userId, sec.id);
    card = await db.query.reviewCard.findFirst({ where: (r, { eq }) => eq(r.sectionId, sec.id) });
    expect(card?.gelee).toBe(false);

    // une carte gelée sort de l'échéancier : rate() refuse tant qu'elle l'est
    await review.freeze(userId, sec.id);
    await expect(review.rate(userId, sec.id, "good")).rejects.toThrow(review.ReviewCardFrozenError);
  });
});
