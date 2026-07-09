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
    ok: true,
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
    await client`delete from planner_config where user_id = ${id}`;
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

const point = (type: "critique" | "important" | "secondaire" = "critique") => ({
  type,
  intitule: "x",
  attendu: "y",
  segments_couverts: [],
});

describe("guide · S3", () => {
  it("getForSection renvoie la section et sa rubrique non-obsolète, ou null si aucune", async () => {
    const sec = await createSection("active");
    expect((await guide.getForSection(userId, sec.id)).guide).toBeNull();

    const created = await guide.generate(userId, sec.id);
    const found = await guide.getForSection(userId, sec.id);
    expect(found.guide?.id).toBe(created.id);
  });


  it("generate refuse une section qui n'est pas active", async () => {
    const sec = await createSection("a_trier");
    await expect(guide.generate(userId, sec.id)).rejects.toThrow(guide.SectionNotActiveError);
  });

  it("generate crée la rubrique a_valider et passe la section en rubrique_a_valider", async () => {
    const sec = await createSection("active");
    const created = await guide.generate(userId, sec.id);

    expect(created.statut).toBe("a_valider");
    const updated = await db.query.section.findFirst({ where: eq(section.id, sec.id) });
    expect(updated?.statut).toBe("rubrique_a_valider");
  });

  it("generate refuse une section qui n'appartient pas à l'utilisateur", async () => {
    const sec = await createSection("active");
    const other = await createUser();
    await expect(guide.generate(other, sec.id)).rejects.toThrow("Section introuvable.");
  });

  it("validate persiste les points édités, passe la rubrique à valide et la section à prete", async () => {
    const sec = await createSection("active");
    const created = await guide.generate(userId, sec.id);

    const edited = [point("critique"), point("secondaire")];
    const validated = await guide.validate(userId, created.id, edited);
    expect(validated.statut).toBe("valide");
    expect(validated.valideLe).not.toBeNull();
    expect(validated.contenu).toEqual({ points: edited });

    const updated = await db.query.section.findFirst({ where: eq(section.id, sec.id) });
    expect(updated?.statut).toBe("prete");
  });

  it("validate refuse une rubrique sans aucun point critique", async () => {
    const sec = await createSection("active");
    const created = await guide.generate(userId, sec.id);

    await expect(guide.validate(userId, created.id, [point("secondaire")])).rejects.toThrow(
      guide.InvalidGuideEditError,
    );

    const untouched = await db.query.section.findFirst({ where: eq(section.id, sec.id) });
    expect(untouched?.statut).toBe("rubrique_a_valider");
  });

  it("validate refuse une rubrique d'un autre utilisateur", async () => {
    const sec = await createSection("active");
    const created = await guide.generate(userId, sec.id);
    const other = await createUser();
    await expect(guide.validate(other, created.id, [point("critique")])).rejects.toThrow(
      "Section introuvable.",
    );
  });

  it("createManual crée une rubrique vide a_valider, éditable puis validable", async () => {
    const sec = await createSection("active");
    const created = await guide.createManual(userId, sec.id);
    expect(created.statut).toBe("a_valider");
    expect(created.contenu).toEqual({ points: [] });

    const validated = await guide.validate(userId, created.id, [point("critique")]);
    expect(validated.statut).toBe("valide");
  });

  it("regenerate refuse s'il n'existe aucune rubrique à régénérer", async () => {
    const sec = await createSection("active");
    await expect(guide.regenerate(userId, sec.id)).rejects.toThrow(guide.NoGuideToRegenerateError);
  });

  it("regenerate passe l'ancienne rubrique obsolete et en crée une nouvelle a_valider", async () => {
    const sec = await createSection("active");
    const first = await guide.generate(userId, sec.id);
    await guide.validate(userId, first.id, [point("critique")]);

    const second = await guide.regenerate(userId, sec.id);
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

    const results = await guide.generateBatch(userId, chapterId);

    expect(results).toHaveLength(1);
    expect(results[0].sectionId).toBe(ok.id);
    expect(results[0].ok).toBe(true);

    const untouched = await db.query.section.findFirst({ where: eq(section.id, notActive.id) });
    expect(untouched?.statut).toBe("a_trier");
  });
});

describe("guide · S3 lazyScheduler", () => {
  async function createSectionImportance(importance: number, ordre = 1) {
    const [sec] = await db
      .insert(section)
      .values({ chapterId, chapterVersion: 1, titre: `Sec imp${importance}`, ordre, niveauSource: 1, contenu: "...", importance, statut: "active" })
      .returning();
    return sec;
  }

  it("génère la rubrique des sections active d'importance ≥ 3, jamais pour l'importance 2 (jamais d'avance)", async () => {
    const imp5 = await createSectionImportance(5, 1);
    const imp2 = await createSectionImportance(2, 2);

    const results = await guide.lazyScheduler(userId);

    expect(results.map((r) => r.sectionId)).toEqual([imp5.id]);
    const untouchedImp2 = await db.query.section.findFirst({ where: eq(section.id, imp2.id) });
    expect(untouchedImp2?.statut).toBe("active");
  });

  it("plafonne à config.nouvellesParJour, priorité à l'importance la plus haute", async () => {
    await account.updatePlannerConfig(userId, 1);
    const imp5 = await createSectionImportance(5, 1);
    const imp4 = await createSectionImportance(4, 2);

    const results = await guide.lazyScheduler(userId);

    expect(results.map((r) => r.sectionId)).toEqual([imp5.id]);
    const untouchedImp4 = await db.query.section.findFirst({ where: eq(section.id, imp4.id) });
    expect(untouchedImp4?.statut).toBe("active");
  });

  it("ne touche pas une section déjà au-delà de active (rubrique_a_valider, prete…)", async () => {
    const already = await createSectionImportance(5, 1);
    await guide.generate(userId, already.id); // -> rubrique_a_valider

    const results = await guide.lazyScheduler(userId);

    expect(results).toHaveLength(0);
  });
});
