import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { db } from "@/db";
import { chapter, section } from "@/db/schema";
import * as account from "./account";

// ponytail: tests d'intégration contre le Postgres local (supabase start),
// même pattern que src/db/schema.test.ts — un utilisateur jetable par test.

const client = postgres(process.env.DATABASE_URL!);
const createdUserIds: string[] = [];

async function createUser() {
  const [user] = await client`
    insert into auth.users (id) values (gen_random_uuid()) returning id
  `;
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
    await client`delete from prompt_config where user_id = ${id}`;
    await client`delete from auth.users where id = ${id}`;
  }
  await client.end();
});

describe("account · S9 partiel", () => {
  it("createSubject assigne un ordre incrémental par utilisateur", async () => {
    const s1 = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
    const s2 = await account.createSubject(userId, { nom: "Droit pénal", semestre: "S1" });
    expect(s1.ordre).toBe(1);
    expect(s2.ordre).toBe(2);
  });

  it("listSubjects trie par ordre et ignore les autres utilisateurs", async () => {
    const otherUserId = await createUser();
    await account.createSubject(otherUserId, { nom: "Autre", semestre: "S1" });
    await account.createSubject(userId, { nom: "B", semestre: "S1" });
    await account.createSubject(userId, { nom: "A", semestre: "S1" });

    const list = await account.listSubjects(userId);
    expect(list.map((s) => s.nom)).toEqual(["B", "A"]);
  });

  it("updateSubject modifie une matière, scoping par utilisateur", async () => {
    const other = await createUser();
    const s = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });

    const updated = await account.updateSubject(userId, s.id, { dateExamen: "2026-12-01" });
    expect(updated.dateExamen).toBe("2026-12-01");

    const blocked = await account.updateSubject(other, s.id, { nom: "Piraté" });
    expect(blocked).toBeUndefined();
  });

  it("archiveSubject / unarchiveSubject font l'aller-retour du statut", async () => {
    const s = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
    const archived = await account.archiveSubject(userId, s.id);
    expect(archived.statut).toBe("archivee");

    const restored = await account.unarchiveSubject(userId, s.id);
    expect(restored.statut).toBe("active");
  });

  it("getPlannerConfig renvoie le défaut tant qu'aucune ligne n'existe", async () => {
    const config = await account.getPlannerConfig(userId);
    expect(config.nouvellesParJour).toBe(3);
  });

  it("updatePlannerConfig fait un upsert idempotent", async () => {
    await account.updatePlannerConfig(userId, 5);
    const second = await account.updatePlannerConfig(userId, 7);
    expect(second.nouvellesParJour).toBe(7);

    const read = await account.getPlannerConfig(userId);
    expect(read.nouvellesParJour).toBe(7);
  });

  it("hasCompletedOnboarding bascule après updatePlannerConfig", async () => {
    expect(await account.hasCompletedOnboarding(userId)).toBe(false);
    await account.updatePlannerConfig(userId, 3);
    expect(await account.hasCompletedOnboarding(userId)).toBe(true);
  });

  it("getMethodologieGlobale / updateMethodologieGlobale font l'aller-retour", async () => {
    expect(await account.getMethodologieGlobale(userId)).toBeNull();
    await account.updateMethodologieGlobale(userId, "Les titres suivent le plan...");
    expect(await account.getMethodologieGlobale(userId)).toBe("Les titres suivent le plan...");
  });

  it("getPlannerConfig renvoie ttsActive=true par défaut ; updateTtsActive fait un upsert idempotent", async () => {
    expect((await account.getPlannerConfig(userId)).ttsActive).toBe(true);
    await account.updateTtsActive(userId, false);
    expect((await account.getPlannerConfig(userId)).ttsActive).toBe(false);
    const second = await account.updateTtsActive(userId, true);
    expect(second.ttsActive).toBe(true);
  });

  it("deleteSubject détruit les chapitres (S1.deleteChapter) puis la matière", async () => {
    const s = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
    const [chap] = await db
      .insert(chapter)
      .values({ subjectId: s.id, titre: "Chap", markdown: "# Chap", contentHash: "h" })
      .returning();
    await db.insert(section).values({
      chapterId: chap.id,
      chapterVersion: 1,
      titre: "Sec",
      ordre: 1,
      niveauSource: 1,
      contenu: "...",
      importance: 3,
      statut: "active",
    });

    await account.deleteSubject(userId, s.id);

    expect(await account.listSubjects(userId)).toHaveLength(0);
    expect(await db.query.chapter.findFirst({ where: eq(chapter.id, chap.id) })).toBeUndefined();
  });

  it("deleteSubject refuse une matière d'un autre utilisateur", async () => {
    const s = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
    const other = await createUser();
    await expect(account.deleteSubject(other, s.id)).rejects.toThrow("Matière introuvable.");
    expect(await account.listSubjects(userId)).toHaveLength(1);
  });

  it("exportUserData renvoie une structure complète, matières archivées comprises", async () => {
    const active = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
    const archived = await account.createSubject(userId, { nom: "Droit pénal", semestre: "S1" });
    await account.archiveSubject(userId, archived.id);
    await db.insert(chapter).values({ subjectId: active.id, titre: "Chap", markdown: "# Chap", contentHash: "h" });

    const data = await account.exportUserData(userId);

    expect(data.subjects.map((s) => s.nom).sort()).toEqual(["Droit civil", "Droit pénal"]);
    expect(data.chapters).toHaveLength(1);
    expect(data.plannerConfig.userId).toBe(userId);
    expect(Array.isArray(data.auditEvents)).toBe(true);
    expect(Array.isArray(data.promptLogs)).toBe(true);
    expect(typeof data.exportedAt).toBe("string");
  });
});
