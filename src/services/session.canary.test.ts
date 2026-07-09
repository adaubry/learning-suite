import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as account from "./account";
import * as guide from "./guide";
import * as session from "./session";
import { db } from "@/db";
import { chapter, section } from "@/db/schema";

// @canary — PLAN.md Phase 6 (Bloc 6.4) : « Again ⇒ RefileItem du jour ; 2ᵉ Again
// consécutif ⇒ section prete ». Figé avec l'humain avant écriture (récitation
// Bloc 6.4) — un canari rouge invalide la modification qui l'a cassé, jamais
// l'inverse (AGENTS §2.5).

const client = postgres(process.env.DATABASE_URL!);
const createdUserIds: string[] = [];

async function createUser() {
  const [user] = await client`insert into auth.users (id) values (gen_random_uuid()) returning id`;
  createdUserIds.push(user.id);
  return user.id as string;
}

function mockCorrectionResponse(body: unknown) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(body) } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }),
  };
}

const point = (type: "critique" | "important" = "critique", intitule = `Point ${type}`) => ({
  type,
  intitule,
  attendu: `attendu ${intitule}`,
  segments_couverts: [],
});

let userId: string;
let chapterId: string;

beforeEach(async () => {
  process.env.LLM_MODEL_CORRECTION_ERREURS = "test/sessionCanary";
  vi.stubGlobal("fetch", vi.fn());

  userId = await createUser();
  const s = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
  const [c] = await db.insert(chapter).values({ subjectId: s.id, titre: "Chap 1", markdown: "# x", contentHash: "h" }).returning();
  chapterId = c.id;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await client`delete from prompt_log where model = 'test/sessionCanary'`;
  for (const id of createdUserIds) {
    await client`delete from refile_item where item_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from error_entry where session_id in (select id from study_session where cycle_id in (select id from study_cycle where user_id = ${id}))`;
    await client`delete from study_session where cycle_id in (select id from study_cycle where user_id = ${id})`;
    await client`delete from study_cycle where user_id = ${id}`;
    await client`delete from review_card where section_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from correction_guide where section_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id}))`;
    await client`delete from chapter where subject_id in (select id from subject where user_id = ${id})`;
    await client`delete from subject where user_id = ${id}`;
    await client`delete from auth.users where id = ${id}`;
  }
  await client.end();
});

// Section en_revision + ReviewCard, prête pour la machine C (état d'entrée).
// importance 2 : ce canary teste rateRevision/Again, pas la restriction Feynman
// (Bloc 7.2) — la fixture doit pouvoir valider directement (sans Feynman).
async function createRevisionSection() {
  const [sec] = await db
    .insert(section)
    .values({ chapterId, chapterVersion: 1, titre: "Sec", ordre: 1, niveauSource: 1, contenu: "...", importance: 2, statut: "active" })
    .returning();
  const created = await guide.createManual(userId, sec.id);
  await guide.validate(userId, created.id, [point("critique"), point("important")]);

  const cycle = await session.start(userId, sec.id);
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
    mockCorrectionResponse({
      diff: [
        { point_index: 1, statut: "couvert", explication: "ok 1" },
        { point_index: 2, statut: "couvert", explication: "ok 2" },
      ],
      erreurs_candidates: [],
    }),
  );
  await session.submitBlurting(userId, cycle.id, "Restitution parfaite.");
  await session.validateSection(userId, cycle.id);

  return db.query.section.findFirst({ where: eq(section.id, sec.id) }).then((s) => s!);
}

async function submitRevisionBlurting(sec: { id: string }) {
  const cycle = await session.start(userId, sec.id);
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
    mockCorrectionResponse({
      diff: [
        { point_index: 1, statut: "couvert", explication: "ok 1" },
        { point_index: 2, statut: "couvert", explication: "ok 2" },
      ],
      erreurs_candidates: [],
    }),
  );
  await session.submitBlurting(userId, cycle.id, "Rappel de révision.");
  return cycle;
}

describe("session · S4 rateRevision (@canary)", () => {
  it("Again : re-file intra-journée (RefileItem du jour, item_type revision)", async () => {
    const sec = await createRevisionSection();
    const cycle = await submitRevisionBlurting(sec);

    await session.rateRevision(userId, cycle.id, "again");

    const refile = await client`select * from refile_item where item_id = ${sec.id} and item_type = 'revision'`;
    expect(refile).toHaveLength(1);
    expect(new Date(refile[0].date).toISOString().slice(0, 10)).toEqual(new Date().toISOString().slice(0, 10));

    const updatedSection = await db.query.section.findFirst({ where: eq(section.id, sec.id) });
    expect(updatedSection?.statut).toBe("en_revision"); // 1er Again seul : pas de retour en étude
  });

  it("2ᵉ Again consécutif : la section retourne prete (étude complète)", async () => {
    const sec = await createRevisionSection();

    const firstCycle = await submitRevisionBlurting(sec);
    await session.rateRevision(userId, firstCycle.id, "again");

    const secondCycle = await submitRevisionBlurting(sec);
    await session.rateRevision(userId, secondCycle.id, "again");

    const updatedSection = await db.query.section.findFirst({ where: eq(section.id, sec.id) });
    expect(updatedSection?.statut).toBe("prete");
  });
});
