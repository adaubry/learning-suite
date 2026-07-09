import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, desc } from "drizzle-orm";
import postgres from "postgres";
import { db } from "@/db";
import { section, studySession, errorEntry } from "@/db/schema";
import * as account from "./account";
import * as guide from "./guide";
import * as session from "./session";
import * as errorService from "./error";
import * as chapterService from "./chapter";

// Canari le plus important du Bloc 8.2 (PLAN.md Phase 8) : la cascade de
// commitUpdate ne doit JAMAIS toucher StudySession/ErrorEntry (ARCHITECTURE §7).
// Contenu réel repris de e2e/evals/fixtures/Introduction obli.md.

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

const point = () => ({
  type: "critique",
  intitule: "Point critique",
  attendu: "Attendu secret",
  segments_couverts: [],
});

let userId: string;
let subjectId: string;

beforeEach(async () => {
  process.env.LLM_MODEL_CORRECTION_ERREURS = "test/chapterCascade";
  vi.stubGlobal("fetch", vi.fn());
  userId = await createUser();
  const s = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
  subjectId = s.id;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await client`delete from prompt_log where model = 'test/chapterCascade'`;
  for (const id of createdUserIds) {
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

function bloc(titre: string, corps: string): string {
  return `## ${titre}\n\n${corps}`;
}

const SOURCES_TITRE = "Sources du droit des obligations";
const SOURCES_CORPS = "À ne pas confondre avec les sources des obligations elles-mêmes.";
const NOTION_TITRE = "Notion d'obligation";
const NOTION_CORPS =
  "L'obligation au sens juridique repose sur une relation entre le créancier et le débiteur.";

describe("chapter · S1.commitUpdate @canary", () => {
  it("StudySession et ErrorEntry antérieures restent inchangées après cascade (modifiée + disparue)", async () => {
    const markdownV1 = `# Introduction\n\n${bloc(SOURCES_TITRE, SOURCES_CORPS)}\n\n${bloc(NOTION_TITRE, NOTION_CORPS)}`;
    const chap = await chapterService.importChapter(userId, {
      subjectId,
      titre: "Introduction",
      markdown: markdownV1,
      acknowledgedAnomalyKeys: [],
    });

    // Sections semées directement (pas de sectionnement LLM ce test — même doctrine que
    // DECISIONS.md #25, Bloc 4.2) : "Sources..." sera modifiée par le ré-import, "Notion..."
    // disparaîtra — les deux portent une StudySession + ErrorEntry réelles avant la cascade.
    const [sourcesSec] = await db
      .insert(section)
      .values({
        chapterId: chap.id,
        chapterVersion: 1,
        titre: SOURCES_TITRE,
        ordre: 1,
        niveauSource: 2,
        contenu: bloc(SOURCES_TITRE, SOURCES_CORPS),
        importance: 3,
        statut: "active",
      })
      .returning();

    const g = await guide.createManual(userId, sourcesSec.id);
    await guide.validate(userId, g.id, [point()]);

    const cycle = await session.start(userId, sourcesSec.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({
        diff: [{ point_index: 1, statut: "manquant", explication: "Explication secrète" }],
        erreurs_candidates: [{ type: "omission", description: "Erreur détectée par le LLM" }],
      }),
    );
    await session.submitBlurting(userId, cycle.id, "Restitution incomplète.");

    const savedSession = await db.query.studySession.findFirst({
      where: eq(studySession.sectionId, sourcesSec.id),
      orderBy: [desc(studySession.tentative)],
    });
    if (!savedSession) throw new Error("Session introuvable (setup du test).");
    await errorService.commitCandidates(userId, savedSession.id);

    const errorRow = await db.query.errorEntry.findFirst({ where: eq(errorEntry.sessionId, savedSession.id) });
    if (!errorRow) throw new Error("ErrorEntry introuvable (setup du test).");

    const sessionAvant = await db.query.studySession.findFirst({ where: eq(studySession.id, savedSession.id) });
    const errorAvant = await db.query.errorEntry.findFirst({ where: eq(errorEntry.id, errorRow.id) });

    // Ré-import : "Sources..." retouchée (⇒ modifiée), "Notion..." supprimée (⇒ disparue).
    const sourcesModifiee = bloc(SOURCES_TITRE, `${SOURCES_CORPS} Phrase ajoutée lors de la mise à jour.`);
    const markdownV2 = `# Introduction\n\n${sourcesModifiee}`;
    const result = await chapterService.commitUpdate(userId, chap.id, markdownV2);
    expect(result.changed).toBe(true);

    const sessionApres = await db.query.studySession.findFirst({ where: eq(studySession.id, savedSession.id) });
    const errorApres = await db.query.errorEntry.findFirst({ where: eq(errorEntry.id, errorRow.id) });

    expect(sessionApres).toEqual(sessionAvant);
    expect(errorApres).toEqual(errorAvant);
  });
});

