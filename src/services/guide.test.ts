import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as account from "./account";
import * as guide from "./guide";
import { db } from "@/db";
import { chapter, section, correctionGuide } from "@/db/schema";

// S3 · GuideService — LLM toujours mocké (fetch), Postgres réel (pattern chapter.test.ts).

const client = postgres(process.env.DATABASE_URL!);
const createdUserIds: string[] = [];

async function createUser() {
  const [user] = await client`insert into auth.users (id) values (gen_random_uuid()) returning id`;
  createdUserIds.push(user.id);
  return user.id as string;
}

function mockGuideResponse(points: unknown[] = [{ type: "critique", intitule: "x", attendu: "y", segments_couverts: [] }]) {
  return {
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ points }) } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }),
  };
}

let userId: string;
let subjectId: string;
let chapterId: string;

beforeEach(async () => {
  process.env.LLM_MODEL_RUBRIQUE = "test/guideService";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockGuideResponse()));

  userId = await createUser();
  const s = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
  subjectId = s.id;
  const [c] = await db
    .insert(chapter)
    .values({ subjectId, titre: "Chap 1", markdown: "# x", contentHash: "h" })
    .returning();
  chapterId = c.id;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await client`delete from prompt_log where model = 'test/guideService'`;
  for (const id of createdUserIds) {
    await client`delete from correction_guide where section_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id}))`;
    await client`delete from chapter where subject_id in (select id from subject where user_id = ${id})`;
    await client`delete from subject where user_id = ${id}`;
    await client`delete from auth.users where id = ${id}`;
  }
  await client.end();
});

async function createSection(statut: "active" | "a_trier" = "active") {
  const [sec] = await db
    .insert(section)
    .values({ chapterId, chapterVersion: 1, titre: "Sec", ordre: 1, niveauSource: 1, contenu: "...", importance: 3, statut })
    .returning();
  return sec;
}

describe("guide · S3", () => {
  it("generate refuse une section qui n'est pas active", async () => {
    const sec = await createSection("a_trier");
    await expect(guide.generate(sec.id)).rejects.toThrow(guide.SectionNotActiveError);
  });

  it("generate crée la rubrique a_valider et passe la section en rubrique_a_valider", async () => {
    const sec = await createSection("active");
    const created = await guide.generate(sec.id);

    expect(created.statut).toBe("a_valider");
    const updated = await db.query.section.findFirst({ where: eq(section.id, sec.id) });
    expect(updated?.statut).toBe("rubrique_a_valider");
  });

  it("validate passe la rubrique à valide et la section à prete", async () => {
    const sec = await createSection("active");
    const created = await guide.generate(sec.id);

    const validated = await guide.validate(created.id);
    expect(validated.statut).toBe("valide");
    expect(validated.valideLe).not.toBeNull();

    const updated = await db.query.section.findFirst({ where: eq(section.id, sec.id) });
    expect(updated?.statut).toBe("prete");
  });

  it("regenerate refuse s'il n'existe aucune rubrique à régénérer", async () => {
    const sec = await createSection("active");
    await expect(guide.regenerate(sec.id)).rejects.toThrow(guide.NoGuideToRegenerateError);
  });

  it("regenerate passe l'ancienne rubrique obsolete et en crée une nouvelle a_valider", async () => {
    const sec = await createSection("active");
    const first = await guide.generate(sec.id);
    await guide.validate(first.id);

    const second = await guide.regenerate(sec.id);
    expect(second.id).not.toBe(first.id);
    expect(second.statut).toBe("a_valider");

    const oldGuide = await db.query.correctionGuide.findFirst({ where: eq(correctionGuide.id, first.id) });
    expect(oldGuide?.statut).toBe("obsolete");

    const updated = await db.query.section.findFirst({ where: eq(section.id, sec.id) });
    expect(updated?.statut).toBe("rubrique_a_valider");
  });

  it("generateBatch génère uniquement les sections active du chapitre, sans qu'un échec bloque les autres", async () => {
    const ok = await createSection("active");
    const notActive = await createSection("a_trier");

    const results = await guide.generateBatch(chapterId);

    expect(results).toHaveLength(1);
    expect(results[0].sectionId).toBe(ok.id);
    expect(results[0].ok).toBe(true);

    const untouched = await db.query.section.findFirst({ where: eq(section.id, notActive.id) });
    expect(untouched?.statut).toBe("a_trier");
  });
});
