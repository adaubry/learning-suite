import { afterAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import * as account from "./account";
import * as errorService from "./error";
import { db } from "@/db";
import { chapter, section, errorEntry, studySession, studyCycle, correctionGuide } from "@/db/schema";

// ponytail: même pattern que account.test.ts — un utilisateur/matière jetables par test.

const client = postgres(process.env.DATABASE_URL!);
const createdUserIds: string[] = [];

async function createUser() {
  const [user] = await client`insert into auth.users (id) values (gen_random_uuid()) returning id`;
  createdUserIds.push(user.id);
  return user.id as string;
}

let userId: string;
let subjectId: string;
let sectionId: string;

beforeEach(async () => {
  userId = await createUser();
  const s = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
  subjectId = s.id;

  const [c] = await db
    .insert(chapter)
    .values({ subjectId, titre: "Chap", markdown: "# x", contentHash: "h" })
    .returning();
  const [sec] = await db
    .insert(section)
    .values({ chapterId: c.id, chapterVersion: 1, titre: "Sec", ordre: 1, niveauSource: 1, contenu: "...", importance: 3 })
    .returning();
  sectionId = sec.id;
  const [guide] = await db
    .insert(correctionGuide)
    .values({ sectionId, chapterVersion: 1, contenu: {}, statut: "valide" })
    .returning();
  const [cycle] = await db.insert(studyCycle).values({ userId, sectionId, type: "etude" }).returning();
  const [session] = await db
    .insert(studySession)
    .values({
      cycleId: cycle.id,
      sectionId,
      guideId: guide.id,
      chapterVersion: 1,
      type: "blurting",
      tentative: 1,
      input: "x",
      divulgation: "controlee",
    })
    .returning();

  await db.insert(errorEntry).values([
    { subjectId, sectionId, sessionId: session.id, type: "omission", description: "active", statut: "active" },
    { subjectId, sectionId, sessionId: session.id, type: "omission", description: "resolue", statut: "resolue" },
  ]);
});

afterAll(async () => {
  for (const id of createdUserIds) {
    await client`delete from error_entry where subject_id in (select id from subject where user_id = ${id})`;
    await client`delete from study_session where section_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from study_cycle where user_id = ${id}`;
    await client`delete from correction_guide where section_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id}))`;
    await client`delete from chapter where subject_id in (select id from subject where user_id = ${id})`;
    await client`delete from subject where user_id = ${id}`;
    await client`delete from auth.users where id = ${id}`;
  }
  await client.end();
});

describe("error · S7 partiel", () => {
  it("activeFor ne renvoie que les erreurs actives de la matière", async () => {
    const rows = await errorService.activeFor(subjectId);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("active");
  });
});
