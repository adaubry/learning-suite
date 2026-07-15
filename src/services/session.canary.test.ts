import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as account from "./account";
import * as guide from "./guide";
import * as session from "./session";
import { db } from "@/db";
import { chapter, section } from "@/db/schema";
import type { Note } from "@/core/fsrs/fsrsCore";

// @canary — PLAN.md Phase 6 (Bloc 6.4) + fusion Machine B/C (2026-07-15,
// DECISIONS.md « Suppression de la dualité étude|révision ») : « Again ⇒
// RefileItem du jour ». La 2ᵉ assertion d'origine (« 2ᵉ Again consécutif ⇒
// section prete ») protégeait un mécanisme explicitement retiré par cette
// décision — il n'existait que pour retomber sur une version allégée du cycle
// (Machine C), qui n'existe plus (toute répétition EST déjà le cycle complet).
// Remplacée par l'assertion inverse : la section reste `en_revision`.
// Modification reconfirmée avec l'humain avant d'y toucher (AGENTS §2.5).

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
  process.env.LLM_MODEL_FEYNMAN = "test/sessionCanary-feynman";
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
  await client`delete from prompt_log where model in ('test/sessionCanary', 'test/sessionCanary-feynman')`;
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

function mockStreamResponse(deltas: string[]) {
  const lines = [
    ...deltas.map((d) => `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`),
    `data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 1, completion_tokens: 1 } })}\n\n`,
    "data: [DONE]\n\n",
  ];
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
  return { ok: true, body };
}

function mockBilanResponse(content: unknown) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }),
  };
}

async function drain(gen: AsyncGenerator<string>): Promise<string> {
  let full = "";
  for await (const chunk of gen) full += chunk;
  return full;
}

// Un cycle complet, du début à la clôture avec une note FSRS donnée — fusion
// Machine B/C (2026-07-15) : TOUTE répétition (1ʳᵉ étude ou révision due)
// traverse lecture→blurting→correction→Feynman→bilan, plus de raccourci.
async function completeCycle(sec: { id: string }, note: Note) {
  const cycle = await session.start(userId, sec.id);
  await session.terminerLecture(userId, cycle.id);
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
    mockCorrectionResponse({
      diff: [
        { point_index: 1, statut: "couvert", explication: "ok 1" },
        { point_index: 2, statut: "couvert", explication: "ok 2" },
      ],
      erreurs_candidates: [],
    }),
  );
  await session.submitBlurting(userId, cycle.id, "Restitution.");

  await session.beginFeynman(userId, cycle.id);
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockStreamResponse(["Ouverture."]));
  await drain(session.openingTurn(userId, cycle.id));

  (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
    mockBilanResponse({
      points: [
        { point_index: 1, statut: "demontre", commentaire: "clair" },
        { point_index: 2, statut: "demontre", commentaire: "clair" },
      ],
      points_solides: [],
      lacunes: [],
    }),
  );
  await session.closeFeynman(userId, cycle.id);
  await session.validateSection(userId, cycle.id, note);
  return cycle;
}

async function createReadySection() {
  const [sec] = await db
    .insert(section)
    .values({ chapterId, chapterVersion: 1, titre: "Sec", ordre: 1, niveauSource: 1, contenu: "...", importance: 2, statut: "active" })
    .returning();
  const created = await guide.createManual(userId, sec.id);
  await guide.validate(userId, created.id, [point("critique"), point("important")]);
  return sec;
}

describe("session · S4 validateSection — auto-note Again (@canary, fusion Machine B/C)", () => {
  it("Again : re-file intra-journée (RefileItem du jour, item_type revision)", async () => {
    const sec = await createReadySection();
    await completeCycle(sec, "good"); // 1ʳᵉ validation : section → en_revision

    await completeCycle(sec, "again");

    const refile = await client`select * from refile_item where item_id = ${sec.id} and item_type = 'revision'`;
    expect(refile).toHaveLength(1);
    expect(new Date(refile[0].date).toISOString().slice(0, 10)).toEqual(new Date().toISOString().slice(0, 10));

    const updatedSection = await db.query.section.findFirst({ where: eq(section.id, sec.id) });
    expect(updatedSection?.statut).toBe("en_revision");
  });

  it("2 Again consécutifs : la section reste en_revision (mécanisme de retour à l'étude complète retiré, fusion Machine B/C 2026-07-15)", async () => {
    const sec = await createReadySection();
    await completeCycle(sec, "good");

    await completeCycle(sec, "again");
    await completeCycle(sec, "again");

    const updatedSection = await db.query.section.findFirst({ where: eq(section.id, sec.id) });
    expect(updatedSection?.statut).toBe("en_revision");

    const refileRows = await client`select * from refile_item where item_id = ${sec.id} and item_type = 'revision'`;
    expect(refileRows).toHaveLength(2); // une par Again, aucun traitement spécial au 2e
  });
});
