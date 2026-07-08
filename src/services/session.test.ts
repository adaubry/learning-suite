import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as account from "./account";
import * as guide from "./guide";
import * as session from "./session";
import { db } from "@/db";
import { chapter, section, studyCycle, studySession, auditEvent } from "@/db/schema";

// S4 · SessionService — LLM toujours mocké (fetch), Postgres réel (pattern guide.test.ts).

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

const diffCouvert = (n: number) => ({ point_index: n, statut: "couvert", explication: `ok ${n}` });
const diffManquant = (n: number) => ({ point_index: n, statut: "manquant", explication: `SECRET explication ${n}` });

const point = (type: "critique" | "important" = "critique", intitule = `Point ${type}`) => ({
  type,
  intitule,
  attendu: `SECRET attendu ${intitule}`,
  segments_couverts: [],
});

let userId: string;
let subjectId: string;
let chapterId: string;

beforeEach(async () => {
  process.env.LLM_MODEL_CORRECTION_ERREURS = "test/sessionService";
  vi.stubGlobal("fetch", vi.fn());

  userId = await createUser();
  const s = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
  subjectId = s.id;
  const [c] = await db.insert(chapter).values({ subjectId, titre: "Chap 1", markdown: "# x", contentHash: "h" }).returning();
  chapterId = c.id;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await client`delete from prompt_log where model = 'test/sessionService'`;
  for (const id of createdUserIds) {
    await client`delete from audit_event where entite_id in (select id from study_session where cycle_id in (select id from study_cycle where user_id = ${id}))`;
    await client`delete from refile_item where item_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from error_entry where session_id in (select id from study_session where cycle_id in (select id from study_cycle where user_id = ${id}))`;
    await client`delete from study_session where cycle_id in (select id from study_cycle where user_id = ${id})`;
    await client`delete from study_cycle where user_id = ${id}`;
    await client`delete from correction_guide where section_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id}))`;
    await client`delete from chapter where subject_id in (select id from subject where user_id = ${id})`;
    await client`delete from subject where user_id = ${id}`;
    await client`delete from auth.users where id = ${id}`;
  }
  await client.end();
});

async function createReadySection(points = [point("critique"), point("important")]) {
  const [sec] = await db
    .insert(section)
    .values({ chapterId, chapterVersion: 1, titre: "Sec", ordre: 1, niveauSource: 1, contenu: "...", importance: 3, statut: "active" })
    .returning();
  const created = await guide.createManual(userId, sec.id);
  await guide.validate(userId, created.id, points);
  return sec;
}

describe("session · S4 start", () => {
  it("crée un cycle en état blurting sur une section prête", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    expect(cycle.etat).toBe("blurting");
    expect(cycle.closedAt).toBeNull();
  });

  it("refuse une section qui n'est pas prête", async () => {
    const [sec] = await db
      .insert(section)
      .values({ chapterId, chapterVersion: 1, titre: "Sec", ordre: 1, niveauSource: 1, contenu: "...", importance: 3, statut: "active" })
      .returning();
    await expect(session.start(userId, sec.id)).rejects.toThrow(session.SectionNotReadyError);
  });

  it("reprend le cycle déjà ouvert sur la même section (idempotent)", async () => {
    const sec = await createReadySection();
    const first = await session.start(userId, sec.id);
    const second = await session.start(userId, sec.id);
    expect(second.id).toBe(first.id);
  });

  it("refuse d'ouvrir une deuxième session sur une autre section (une seule session ouverte)", async () => {
    const secA = await createReadySection();
    const secB = await createReadySection();
    await session.start(userId, secA.id);
    await expect(session.start(userId, secB.id)).rejects.toThrow(session.SessionAlreadyOpenError);
  });
});

describe("session · S4 submitBlurting", () => {
  it("sauvegarde le blurting AVANT l'appel LLM : l'input survit à un échec LLM", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("réseau down"));

    await expect(session.submitBlurting(userId, cycle.id, "Ma restitution.")).rejects.toThrow();

    const rows = await db.query.studySession.findMany({ where: eq(studySession.cycleId, cycle.id) });
    expect(rows).toHaveLength(1);
    expect(rows[0].input).toBe("Ma restitution.");
    expect(rows[0].correction).toBeNull();
  });

  it("verdict insuffisant : la réponse masque attendu/explication des points non couverts", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffManquant(1), diffCouvert(2)], erreurs_candidates: [] }),
    );

    const result = await session.submitBlurting(userId, cycle.id, "Ma restitution.");

    expect(result.verdict).toBe("insuffisant");
    expect(result.divulgation).toBe("controlee");
    // le point manquant (critique) est masqué — le point couvert, lui, reste visible.
    expect(result.diff[0]).toEqual({ intitule: "Point critique", statut: "manquant" });
    expect(JSON.stringify(result.diff[0])).not.toContain("SECRET");

    const updatedCycle = await db.query.studyCycle.findFirst({ where: eq(studyCycle.id, cycle.id) });
    expect(updatedCycle?.etat).toBe("correction");
  });

  it("verdict acquis : divulgation complète d'emblée", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffCouvert(1), diffCouvert(2)], erreurs_candidates: [] }),
    );

    const result = await session.submitBlurting(userId, cycle.id, "Ma restitution parfaite.");

    expect(result.verdict).toBe("acquis");
    expect(result.divulgation).toBe("complete");
    expect(JSON.stringify(result)).toContain("SECRET");
  });

  it("résout recidive_index vers le vrai id de l'erreur active", async () => {
    const sec = await createReadySection();

    // première tentative (acquis) pour obtenir une StudySession réelle à laquelle
    // rattacher une ErrorEntry active (S7.commitCandidates la créerait ainsi en
    // Bloc 5.3 ; ici on fixe juste le contexte de récidive du test).
    const firstCycle = await session.start(userId, sec.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffCouvert(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    const firstResult = await session.submitBlurting(userId, firstCycle.id, "Première restitution.");
    await session.terminerSessionTemporaire(userId, firstCycle.id);

    const [erreurActive] = await client`insert into error_entry (subject_id, section_id, session_id, type, description)
      values (${subjectId}, ${sec.id}, ${firstResult.sessionId}, 'confusion', 'erreur récurrente') returning id`;

    const secondCycle = await session.start(userId, sec.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({
        diff: [diffCouvert(1), diffCouvert(2)],
        erreurs_candidates: [{ type: "confusion", description: "encore", recidive_index: 1 }],
      }),
    );
    const result = await session.submitBlurting(userId, secondCycle.id, "Deuxième restitution.");

    expect(result.erreursCandidates[0].idErreurExistante).toBe(erreurActive.id);
  });
});

describe("session · S4 resolveOutcome", () => {
  async function submitInsuffisant(sec: Awaited<ReturnType<typeof createReadySection>>) {
    const cycle = await session.start(userId, sec.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffManquant(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    await session.submitBlurting(userId, cycle.id, "Restitution incomplète.");
    return cycle;
  }

  it("retenter : re-file l'étude, boucle vers blurting, ne journalise rien", async () => {
    const sec = await createReadySection();
    const cycle = await submitInsuffisant(sec);

    await session.resolveOutcome(userId, cycle.id, "retenter");

    const updatedCycle = await db.query.studyCycle.findFirst({ where: eq(studyCycle.id, cycle.id) });
    expect(updatedCycle?.closedAt).toBeNull();
    expect(updatedCycle?.etat).toBe("blurting");

    const refile = await client`select * from refile_item where item_id = ${sec.id}`;
    expect(refile).toHaveLength(1);

    const events = await db.query.auditEvent.findMany({ where: eq(auditEvent.entiteType, "study_session") });
    expect(events).toHaveLength(0);
  });

  it("reveler : divulgation complète journalisée, re-file, boucle vers blurting", async () => {
    const sec = await createReadySection();
    const cycle = await submitInsuffisant(sec);

    await session.resolveOutcome(userId, cycle.id, "reveler");

    const latest = await db.query.studySession.findFirst({ where: eq(studySession.cycleId, cycle.id) });
    expect(latest?.divulgation).toBe("complete");

    const events = await db.query.auditEvent.findMany({ where: eq(auditEvent.entiteType, "study_session") });
    expect(events.some((e) => e.type === "revelation_correction")).toBe(true);

    const updatedCycle = await db.query.studyCycle.findFirst({ where: eq(studyCycle.id, cycle.id) });
    expect(updatedCycle?.etat).toBe("blurting");
  });

  it("refuse une issue sur un verdict acquis", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffCouvert(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    await session.submitBlurting(userId, cycle.id, "Restitution parfaite.");

    await expect(session.resolveOutcome(userId, cycle.id, "retenter")).rejects.toThrow(session.WrongCycleStateError);
  });
});

describe("session · S4 abandon", () => {
  it("ferme le cycle et libère le slot pour une autre section", async () => {
    const secA = await createReadySection();
    const secB = await createReadySection();
    const cycle = await session.start(userId, secA.id);

    await session.abandon(userId, cycle.id);

    const closed = await db.query.studyCycle.findFirst({ where: eq(studyCycle.id, cycle.id) });
    expect(closed?.closedAt).not.toBeNull();
    expect(closed?.etat).toBe("clos");

    await expect(session.start(userId, secB.id)).resolves.toBeTruthy();
  });
});

describe("session · S4 terminerSessionTemporaire", () => {
  it("ferme le cycle sur verdict acquis sans toucher au statut de la section", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffCouvert(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    await session.submitBlurting(userId, cycle.id, "Restitution parfaite.");

    await session.terminerSessionTemporaire(userId, cycle.id);

    const closed = await db.query.studyCycle.findFirst({ where: eq(studyCycle.id, cycle.id) });
    expect(closed?.closedAt).not.toBeNull();

    const untouchedSection = await db.query.section.findFirst({ where: eq(section.id, sec.id) });
    expect(untouchedSection?.statut).toBe("prete");
  });

  it("refuse sur un verdict insuffisant", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffManquant(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    await session.submitBlurting(userId, cycle.id, "Restitution incomplète.");

    await expect(session.terminerSessionTemporaire(userId, cycle.id)).rejects.toThrow(session.WrongCycleStateError);
  });
});
