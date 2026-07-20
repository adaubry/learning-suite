import { afterAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { db } from "@/db";
import {
  chapter,
  section,
  correctionGuide,
  studyCycle,
  studySession,
  errorEntry,
  reviewCard,
} from "@/db/schema";
import * as account from "./account";

// @canary PLAN Phase 9 : « export JSON re-parsable complet ». Une matière/chapitre
// archivés et un exemplaire de chaque table journalisée sont semés (S9.exportUserData
// n'a aucun filtre de statut, DECISIONS.md Bloc 9.1) — le round-trip JSON.stringify/parse
// ne doit rien perdre au niveau des collections (pas de champ silencieusement undefined).

const client = postgres(process.env.DATABASE_URL!);
const createdUserIds: string[] = [];

async function createUser() {
  const [user] = await client`insert into "user" (name, email) values ('Test', gen_random_uuid()::text || '@example.com') returning id`;
  createdUserIds.push(user.id);
  return user.id as string;
}

let userId: string;

beforeEach(async () => {
  userId = await createUser();
});

afterAll(async () => {
  for (const id of createdUserIds) {
    await client`delete from error_entry where subject_id in (select id from subject where user_id = ${id})`;
    await client`delete from study_session where section_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from study_cycle where section_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from review_card where section_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from correction_guide where section_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id}))`;
    await client`delete from chapter where subject_id in (select id from subject where user_id = ${id})`;
    await client`delete from subject where user_id = ${id}`;
    await client`delete from planner_config where user_id = ${id}`;
    await client`delete from "user" where id = ${id}`;
  }
  await client.end();
});

describe("account · S9 exportUserData @canary", () => {
  it("export JSON re-parsable complet : rien perdu au round-trip, archives comprises", async () => {
    const active = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
    const archived = await account.createSubject(userId, { nom: "Droit pénal", semestre: "S1" });
    await account.archiveSubject(userId, archived.id);

    const [chap] = await db
      .insert(chapter)
      .values({ subjectId: active.id, titre: "Chap", markdown: "# Chap", contentHash: "h" })
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
        statut: "prete",
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
    const [sess] = await db
      .insert(studySession)
      .values({
        cycleId: cycle.id,
        sectionId: sec.id,
        guideId: guide.id,
        chapterVersion: 1,
        type: "blurting",
        tentative: 1,
        input: "Restitution",
        verdictFinal: "insuffisant",
        divulgation: "controlee",
      })
      .returning();
    await db.insert(errorEntry).values({
      subjectId: active.id,
      sectionId: sec.id,
      sessionId: sess.id,
      type: "omission",
      description: "Point manquant",
    });
    await db.insert(reviewCard).values({ sectionId: sec.id, due: "2026-07-20", stability: 1, difficulty: 5 });

    const data = await account.exportUserData(userId);
    const roundTripped = JSON.parse(JSON.stringify(data)) as typeof data;

    const collections = [
      "subjects",
      "chapters",
      "sections",
      "correctionGuides",
      "reviewCards",
      "studyCycles",
      "studySessions",
      "errorEntries",
      "auditEvents",
      "promptLogs",
    ] as const;
    for (const key of collections) {
      expect(Array.isArray(roundTripped[key])).toBe(true);
      expect(roundTripped[key]).toHaveLength(data[key].length);
    }

    expect(roundTripped.subjects.some((s) => s.statut === "archivee")).toBe(true);
    expect(roundTripped.errorEntries[0].description).toBe("Point manquant");
    expect(roundTripped.reviewCards[0].due).toBe("2026-07-20");
    expect(typeof roundTripped.exportedAt).toBe("string");
  });
});
