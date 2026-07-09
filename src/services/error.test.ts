import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
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
let sessionId: string;
let activeErrorId: string;

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
  sessionId = session.id;

  const [activeError] = await db
    .insert(errorEntry)
    .values({ subjectId, sectionId, sessionId, type: "omission", description: "active", statut: "active" })
    .returning();
  activeErrorId = activeError.id;
  await db
    .insert(errorEntry)
    .values({ subjectId, sectionId, sessionId, type: "omission", description: "resolue", statut: "resolue" });
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

async function setCorrection(erreursCandidates: unknown) {
  await db
    .update(studySession)
    .set({ correction: { diff: [], erreursCandidates } })
    .where(eq(studySession.id, sessionId));
}

describe("error · S7", () => {
  it("activeFor ne renvoie que les erreurs actives de la matière", async () => {
    const rows = await errorService.activeFor(subjectId);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("active");
  });

  describe("commitCandidates", () => {
    it("crée une nouvelle ErrorEntry pour une candidate sans récidive", async () => {
      await setCorrection([{ type: "confusion", description: "nouvelle erreur", idErreurExistante: null }]);
      await errorService.commitCandidates(userId, sessionId, []);

      const rows = await errorService.list(userId, { sectionId, type: "confusion" });
      expect(rows).toHaveLength(1);
      expect(rows[0].description).toBe("nouvelle erreur");
      expect(rows[0].occurrences).toBe(1);
    });

    it("incrémente occurrences au lieu de dupliquer sur récidive (idErreurExistante)", async () => {
      await setCorrection([{ type: "omission", description: "revu", idErreurExistante: activeErrorId }]);
      await errorService.commitCandidates(userId, sessionId, []);

      const rows = await errorService.list(userId, { sectionId, statut: "active" });
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(activeErrorId);
      expect(rows[0].occurrences).toBe(2);
    });

    it("index rejeté (rejectedIndexes) ⇒ candidate non committée", async () => {
      await setCorrection([{ type: "confusion", description: "à rejeter", idErreurExistante: null }]);
      await errorService.commitCandidates(userId, sessionId, [0]);

      const rows = await errorService.list(userId, { sectionId, type: "confusion" });
      expect(rows).toHaveLength(0);
    });

    it("auto-acceptation : un index non explicitement rejeté est committé", async () => {
      await setCorrection([
        { type: "confusion", description: "gardée", idErreurExistante: null },
        { type: "imprecision", description: "rejetée", idErreurExistante: null },
      ]);
      await errorService.commitCandidates(userId, sessionId, [1]);

      const rows = await errorService.list(userId, { sectionId });
      const descriptions = rows.map((r) => r.description);
      expect(descriptions).toContain("gardée");
      expect(descriptions).not.toContain("rejetée");
    });

    it("refuse une session qui n'appartient pas à l'utilisateur", async () => {
      const otherUserId = await createUser();
      await setCorrection([{ type: "confusion", description: "x", idErreurExistante: null }]);
      await expect(errorService.commitCandidates(otherUserId, sessionId, [])).rejects.toThrow();
    });
  });

  describe("list/resolve/edit/deleteEntry", () => {
    it("list filtre par statut et scope à l'utilisateur", async () => {
      const otherUserId = await createUser();
      const rows = await errorService.list(userId, { statut: "active" });
      expect(rows).toHaveLength(1);
      const otherRows = await errorService.list(otherUserId, { statut: "active" });
      expect(otherRows).toHaveLength(0);
    });

    it("resolve passe le statut à resolue", async () => {
      const updated = await errorService.resolve(userId, activeErrorId);
      expect(updated.statut).toBe("resolue");
    });

    it("edit modifie la description", async () => {
      const updated = await errorService.edit(userId, activeErrorId, { description: "corrigée" });
      expect(updated.description).toBe("corrigée");
    });

    it("deleteEntry supprime la ligne", async () => {
      await errorService.deleteEntry(userId, activeErrorId);
      const rows = await errorService.list(userId, { sectionId });
      expect(rows.find((r) => r.id === activeErrorId)).toBeUndefined();
    });

    it("refuse resolve/edit/delete pour un autre utilisateur", async () => {
      const otherUserId = await createUser();
      await expect(errorService.resolve(otherUserId, activeErrorId)).rejects.toThrow();
      await expect(errorService.edit(otherUserId, activeErrorId, { description: "x" })).rejects.toThrow();
      await expect(errorService.deleteEntry(otherUserId, activeErrorId)).rejects.toThrow();
    });
  });
});
