import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { db } from "@/db";
import { chapter, section, reviewCard, studyCycle, studySession, correctionGuide } from "@/db/schema";
import * as account from "./account";
import * as chapterService from "./chapter";
import * as planner from "./planner";

// @canary PLAN Phase 9 : archiver un chapitre l'exclut de la file du jour (S5, filtre
// chapter.statut — DECISIONS.md Bloc 9.1 : pur flip de statut, aucune cascade sur
// ReviewCard) ; désarchiver le fait réapparaître SANS toucher aux échéances ni à
// l'historique d'étude.

const client = postgres(process.env.DATABASE_URL!);
const createdUserIds: string[] = [];

async function createUser() {
  const [user] = await client`insert into auth.users (id) values (gen_random_uuid()) returning id`;
  createdUserIds.push(user.id);
  return user.id as string;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await client`delete from study_session where section_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from study_cycle where section_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from review_card where section_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from correction_guide where section_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id}))`;
    await client`delete from chapter where subject_id in (select id from subject where user_id = ${id})`;
    await client`delete from subject where user_id = ${id}`;
    await client`delete from auth.users where id = ${id}`;
  }
  await client.end();
});

const TODAY = "2026-07-20";

describe("chapter · archiveChapter/unarchiveChapter @canary", () => {
  it("archivé ⇒ exclu de la file du jour ; désarchivé ⇒ réapparaît, échéance et historique intacts", async () => {
    const userId = await createUser();
    const subject = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
    const [chap] = await db
      .insert(chapter)
      .values({ subjectId: subject.id, titre: "Chap", markdown: "# Chap", contentHash: "h" })
      .returning();
    const [sec] = await db
      .insert(section)
      .values({
        chapterId: chap.id,
        chapterVersion: 1,
        titre: "Sec",
        ordre: 1,
        niveauSource: 1,
        contenu: "...",
        importance: 3,
        statut: "en_revision",
      })
      .returning();
    const [guide] = await db
      .insert(correctionGuide)
      .values({ sectionId: sec.id, chapterVersion: 1, contenu: [{ type: "critique", intitule: "x" }], statut: "valide" })
      .returning();
    const [cycle] = await db
      .insert(studyCycle)
      .values({ userId, sectionId: sec.id, type: "etude", etat: "clos", closedAt: new Date() })
      .returning();
    await db.insert(studySession).values({
      cycleId: cycle.id,
      sectionId: sec.id,
      guideId: guide.id,
      chapterVersion: 1,
      type: "blurting",
      tentative: 1,
      input: "Restitution",
      verdictFinal: "acquis",
      divulgation: "controlee",
    });
    await db.insert(reviewCard).values({ sectionId: sec.id, due: TODAY, stability: 3, difficulty: 5, reps: 2, lapses: 1 });

    const cardAvant = await db.query.reviewCard.findFirst({ where: (t, { eq }) => eq(t.sectionId, sec.id) });
    const sessionAvant = await db.query.studySession.findFirst({ where: (t, { eq }) => eq(t.sectionId, sec.id) });

    expect(await planner.todayQueue(userId, TODAY)).toHaveLength(1);

    await chapterService.archiveChapter(userId, chap.id);
    expect(await planner.todayQueue(userId, TODAY)).toEqual([]);

    await chapterService.unarchiveChapter(userId, chap.id);
    const queueApres = await planner.todayQueue(userId, TODAY);
    expect(queueApres).toHaveLength(1);
    expect(queueApres[0]).toMatchObject({ kind: "revision", sectionId: sec.id });

    const cardApres = await db.query.reviewCard.findFirst({ where: (t, { eq }) => eq(t.sectionId, sec.id) });
    const sessionApres = await db.query.studySession.findFirst({ where: (t, { eq }) => eq(t.sectionId, sec.id) });
    expect(cardApres).toEqual(cardAvant);
    expect(sessionApres).toEqual(sessionAvant);
  });
});
