import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as account from "./account";
import * as guide from "./guide";
import * as session from "./session";
import { db } from "@/db";
import { chapter, section, studyCycle, studySession, auditEvent, errorEntry } from "@/db/schema";
import type { Note } from "@/core/fsrs/fsrsCore";

// S4 · SessionService — LLM toujours mocké (fetch), Postgres réel (pattern guide.test.ts).
// REVAMP v2 (2026-07-15) : un cycle d'étude démarre désormais en `lecture`, pas
// `blurting` — tout helper qui enchaîne sur submitBlurting passe par
// `session.terminerLecture` d'abord.

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

let userId: string;
let subjectId: string;
let chapterId: string;

beforeEach(async () => {
  process.env.LLM_MODEL_CORRECTION_ERREURS = "test/sessionService";
  process.env.LLM_MODEL_TRANSCRIPTION = "test/sessionService-transcription";
  process.env.LLM_MODEL_FEYNMAN = "test/sessionService-feynman";
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
  await client`delete from prompt_log where model in ('test/sessionService', 'test/sessionService-transcription', 'test/sessionService-feynman')`;
  for (const id of createdUserIds) {
    await client`delete from audit_event where entite_id in (select id from study_session where cycle_id in (select id from study_cycle where user_id = ${id}))`;
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

// Feynman obligatoire pour toute importance 2 à 5 depuis REVAMP v2 : plus de
// distinction 2 vs ≥3, importance 2 par défaut suffit à tous les tests.
async function createReadySection(points = [point("critique"), point("important")], importance = 2) {
  const [sec] = await db
    .insert(section)
    .values({ chapterId, chapterVersion: 1, titre: "Sec", ordre: 1, niveauSource: 1, contenu: "...", importance, statut: "active" })
    .returning();
  const created = await guide.createManual(userId, sec.id);
  await guide.validate(userId, created.id, points);
  return sec;
}

// beginFeynman (transition) + openingTurn (streaming) combinés.
async function enterFeynman(cycle: { id: string }, deltas: string[] = ["Ouverture."], rejectedCandidateIndexes: number[] = []) {
  await session.beginFeynman(userId, cycle.id, rejectedCandidateIndexes);
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockStreamResponse(deltas));
  return drain(session.openingTurn(userId, cycle.id));
}

// Point de départ commun aux tests Feynman : blurting acquis, cycle en `correction`.
async function readyForFeynman(points = [point("critique"), point("important")]) {
  const sec = await createReadySection(points);
  const cycle = await session.start(userId, sec.id);
  await session.terminerLecture(userId, cycle.id);
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
    mockCorrectionResponse({ diff: [diffCouvert(1), diffCouvert(2)], erreurs_candidates: [] }),
  );
  await session.submitBlurting(userId, cycle.id, "Restitution parfaite.");
  return { sec, cycle };
}

// Section `en_revision` + ReviewCard due aujourd'hui — état d'entrée d'une répétition
// (fusion Machine B/C, 2026-07-15 : traverse le même cycle qu'une 1ʳᵉ étude).
// Passe désormais par le Feynman en entier (obligatoire pour toute importance).
async function createRevisionSection(points = [point("critique"), point("important")]) {
  const { cycle } = await readyForFeynman(points);
  await enterFeynman(cycle);
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
  await session.validateSection(userId, cycle.id, "good");
  return db.query.section.findFirst({ where: eq(section.id, cycle.sectionId) }).then((s) => s!);
}

describe("session · S4 start", () => {
  it("crée un cycle en état lecture sur une section prête (REVAMP v2)", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    expect(cycle.etat).toBe("lecture");
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

  it("deux session.start() vraiment concurrentes (2 devices) : une seule gagne, l'autre reçoit SessionAlreadyOpenError, jamais une erreur DB brute", async () => {
    // Promise.all (pas de await séquentiel) : les deux lectures peuvent passer
    // avant que l'un des deux INSERT ne committe — seul l'index unique partiel
    // (study_cycle_one_open_per_user) protège ce chemin, la vérification
    // applicative seule (read-then-write) ne suffit pas (TOCTOU).
    const secA = await createReadySection();
    const secB = await createReadySection();
    const results = await Promise.allSettled([session.start(userId, secA.id), session.start(userId, secB.id)]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(session.SessionAlreadyOpenError);

    const openCycles = await db.query.studyCycle.findMany({
      where: (c, { and, eq, isNull }) => and(eq(c.userId, userId), isNull(c.closedAt)),
    });
    expect(openCycles).toHaveLength(1);
  });

  it("section en_revision : ouvre un cycle de type revision, en lecture comme toute répétition (fusion Machine B/C, 2026-07-15)", async () => {
    const sec = await createRevisionSection();
    const cycle = await session.start(userId, sec.id);
    expect(cycle.type).toBe("revision");
    expect(cycle.etat).toBe("lecture");
  });

  it("refuse une révision sur une ReviewCard gelée", async () => {
    const sec = await createRevisionSection();
    const { freeze } = await import("./review");
    await freeze(userId, sec.id);
    await expect(session.start(userId, sec.id)).rejects.toThrow(session.SectionNotReadyError);
  });
});

describe("session · S4 terminerLecture (REVAMP v2)", () => {
  it("transitionne lecture → blurting", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    await session.terminerLecture(userId, cycle.id);
    const updated = await db.query.studyCycle.findFirst({ where: eq(studyCycle.id, cycle.id) });
    expect(updated?.etat).toBe("blurting");
  });

  it("refuse depuis un autre état que lecture", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    await session.terminerLecture(userId, cycle.id);
    await expect(session.terminerLecture(userId, cycle.id)).rejects.toThrow(session.WrongCycleStateError);
  });
});

describe("session · S4 lectureContext (REVAMP v2)", () => {
  it("tentative 1, diff null en lecture initiale", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    const ctx = await session.lectureContext(userId, cycle.id);
    expect(ctx).toEqual({ tentative: 1, diff: null });
  });

  it("tentative 2, diff de la correction_1 en relecture ciblée", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    await session.terminerLecture(userId, cycle.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockCorrectionResponse({ diff: [diffManquant(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    await session.submitBlurting(userId, cycle.id, "Restitution incomplète.");
    await session.resolveOutcome(userId, cycle.id);

    const ctx = await session.lectureContext(userId, cycle.id);
    expect(ctx.tentative).toBe(2);
    expect(ctx.diff![0]).toEqual({
      intitule: "Point critique",
      type: "critique",
      statut: "manquant",
      attendu: "SECRET attendu Point critique",
      explication: "SECRET explication 1",
    });
  });

  it("refuse hors de l'état lecture", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    await session.terminerLecture(userId, cycle.id);
    await expect(session.lectureContext(userId, cycle.id)).rejects.toThrow(session.WrongCycleStateError);
  });
});

describe("session · S4 findOpenCycle", () => {
  it("renvoie null sans cycle ouvert", async () => {
    expect(await session.findOpenCycle(userId)).toBeNull();
  });

  it("renvoie le cycle ouvert avec de quoi construire un lien de reprise", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);

    const open = await session.findOpenCycle(userId);

    expect(open).toEqual({
      cycleId: cycle.id,
      sectionId: sec.id,
      sectionTitre: sec.titre,
      type: "etude",
    });
  });

  it("renvoie null après clôture du cycle", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    await session.abandon(userId, cycle.id);

    expect(await session.findOpenCycle(userId)).toBeNull();
  });
});

describe("session · S4 submitBlurting", () => {
  it("sauvegarde le blurting AVANT l'appel LLM : l'input survit à un échec LLM", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    await session.terminerLecture(userId, cycle.id);
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("réseau down"));

    await expect(session.submitBlurting(userId, cycle.id, "Ma restitution.")).rejects.toThrow();

    const rows = await db.query.studySession.findMany({ where: eq(studySession.cycleId, cycle.id) });
    expect(rows).toHaveLength(1);
    expect(rows[0].input).toBe("Ma restitution.");
    expect(rows[0].correction).toBeNull();
  });

  it("refuse depuis l'état lecture (garde d'état existante)", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    await expect(session.submitBlurting(userId, cycle.id, "Trop tôt.")).rejects.toThrow(session.WrongCycleStateError);
  });

  it("verdict insuffisant : divulgation toujours complète, plus de masquage (rupture A, REVAMP v2)", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    await session.terminerLecture(userId, cycle.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffManquant(1), diffCouvert(2)], erreurs_candidates: [] }),
    );

    const result = await session.submitBlurting(userId, cycle.id, "Ma restitution.");

    expect(result.verdict).toBe("insuffisant");
    expect(result.diff[0]).toEqual({
      intitule: "Point critique",
      type: "critique",
      statut: "manquant",
      attendu: "SECRET attendu Point critique",
      explication: "SECRET explication 1",
    });
    expect(JSON.stringify(result)).toContain("SECRET");

    const updatedCycle = await db.query.studyCycle.findFirst({ where: eq(studyCycle.id, cycle.id) });
    expect(updatedCycle?.etat).toBe("correction");
  });

  it("verdict acquis : divulgation complète également (le verdict ne change plus rien)", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    await session.terminerLecture(userId, cycle.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffCouvert(1), diffCouvert(2)], erreurs_candidates: [] }),
    );

    const result = await session.submitBlurting(userId, cycle.id, "Ma restitution parfaite.");

    expect(result.verdict).toBe("acquis");
    expect(JSON.stringify(result)).toContain("SECRET");
  });

  it("refuse une 3ᵉ tentative de blurting en étude (cap à 2 passes, REVAMP v2)", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    await session.terminerLecture(userId, cycle.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffManquant(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    await session.submitBlurting(userId, cycle.id, "Tentative 1.");
    await session.resolveOutcome(userId, cycle.id);
    await session.terminerLecture(userId, cycle.id);
    await session.submitBlurting(userId, cycle.id, "Tentative 2.");

    // Aucune voie normale ne ramène en `blurting` après la 2ᵉ passe (seul
    // Feynman/abandonner sont atteignables) — le cap est un garde défensif,
    // vérifié directement en forçant l'état pour l'exercer.
    await db.update(studyCycle).set({ etat: "blurting" }).where(eq(studyCycle.id, cycle.id));
    await expect(session.submitBlurting(userId, cycle.id, "Tentative 3.")).rejects.toThrow(session.WrongCycleStateError);
  });

  it("résout recidive_index vers le vrai id de l'erreur active", async () => {
    const sec = await createReadySection();

    const firstCycle = await session.start(userId, sec.id);
    await session.terminerLecture(userId, firstCycle.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffCouvert(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    const firstResult = await session.submitBlurting(userId, firstCycle.id, "Première restitution.");
    // abandon (pas validateSection) : ce test porte sur la résolution de
    // recidive_index, pas sur la transition de section — juste besoin de
    // libérer le slot de session unique pour redémarrer sur la même section.
    await session.abandon(userId, firstCycle.id);

    const [erreurActive] = await client`insert into error_entry (subject_id, section_id, session_id, type, description)
      values (${subjectId}, ${sec.id}, ${firstResult.sessionId}, 'confusion', 'erreur récurrente') returning id`;

    const secondCycle = await session.start(userId, sec.id);
    await session.terminerLecture(userId, secondCycle.id);
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

describe("session · S4 resolveOutcome (REVAMP v2, rupture B)", () => {
  async function submitInsuffisant(sec: Awaited<ReturnType<typeof createReadySection>>) {
    const cycle = await session.start(userId, sec.id);
    await session.terminerLecture(userId, cycle.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffManquant(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    await session.submitBlurting(userId, cycle.id, "Restitution incomplète.");
    return cycle;
  }

  it("boucle vers lecture (relecture ciblée), ne journalise rien, ne re-file jamais", async () => {
    const sec = await createReadySection();
    const cycle = await submitInsuffisant(sec);

    await session.resolveOutcome(userId, cycle.id);

    const updatedCycle = await db.query.studyCycle.findFirst({ where: eq(studyCycle.id, cycle.id) });
    expect(updatedCycle?.closedAt).toBeNull();
    expect(updatedCycle?.etat).toBe("lecture");

    const refile = await client`select * from refile_item where item_id = ${sec.id}`;
    expect(refile).toHaveLength(0);

    const blurtingSession = (await db.query.studySession.findFirst({ where: eq(studySession.cycleId, cycle.id) }))!;
    const events = await db.query.auditEvent.findMany({ where: eq(auditEvent.entiteId, blurtingSession.id) });
    expect(events).toHaveLength(0);
  });

  it("disponible aussi sur verdict acquis : le verdict ne conditionne plus rien (ARCHITECTURE §5)", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    await session.terminerLecture(userId, cycle.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffCouvert(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    await session.submitBlurting(userId, cycle.id, "Restitution parfaite.");

    await session.resolveOutcome(userId, cycle.id);

    const updatedCycle = await db.query.studyCycle.findFirst({ where: eq(studyCycle.id, cycle.id) });
    expect(updatedCycle?.etat).toBe("lecture");
  });

  it("refuse une 2ᵉ relecture : la tentative 2 est déjà la dernière passe", async () => {
    const sec = await createReadySection();
    const cycle = await submitInsuffisant(sec);
    await session.resolveOutcome(userId, cycle.id);
    await session.terminerLecture(userId, cycle.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffManquant(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    await session.submitBlurting(userId, cycle.id, "Restitution 2.");

    await expect(session.resolveOutcome(userId, cycle.id)).rejects.toThrow(session.WrongCycleStateError);
  });

  it("commit les candidates non rejetées (S7.commitCandidates, Bloc 5.3)", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    await session.terminerLecture(userId, cycle.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({
        diff: [diffManquant(1), diffCouvert(2)],
        erreurs_candidates: [
          { type: "confusion", description: "gardée" },
          { type: "imprecision", description: "rejetée" },
        ],
      }),
    );
    await session.submitBlurting(userId, cycle.id, "Restitution incomplète.");

    await session.resolveOutcome(userId, cycle.id, [1]);

    const rows = await db.query.errorEntry.findMany({ where: eq(errorEntry.sectionId, sec.id) });
    expect(rows.map((r) => r.description)).toEqual(["gardée"]);
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

describe("session · S4 retryCorrection", () => {
  it("rejoue L3 sur la tentative sauvegardée sans en créer une nouvelle", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    await session.terminerLecture(userId, cycle.id);
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("réseau down"));

    await expect(session.submitBlurting(userId, cycle.id, "Ma restitution.")).rejects.toThrow();

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffCouvert(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    const result = await session.retryCorrection(userId, cycle.id);

    expect(result.tentative).toBe(1);
    expect(result.verdict).toBe("acquis");

    const rows = await db.query.studySession.findMany({ where: eq(studySession.cycleId, cycle.id) });
    expect(rows).toHaveLength(1);
    expect(rows[0].input).toBe("Ma restitution.");
  });

  it("refuse s'il n'y a aucune tentative en échec à relancer", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    await session.terminerLecture(userId, cycle.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffCouvert(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    await session.submitBlurting(userId, cycle.id, "Restitution.");

    await expect(session.retryCorrection(userId, cycle.id)).rejects.toThrow(session.WrongCycleStateError);
  });
});

describe("session · S4 getCurrentCorrection", () => {
  it("status pending quand la tentative sauvegardée n'a pas encore de correction", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    await session.terminerLecture(userId, cycle.id);
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("réseau down"));
    await expect(session.submitBlurting(userId, cycle.id, "Ma restitution.")).rejects.toThrow();

    const current = await session.getCurrentCorrection(userId, cycle.id);
    expect(current.status).toBe("pending");
  });

  it("status ready : relit la correction déjà persistée, sans nouvel appel LLM", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    await session.terminerLecture(userId, cycle.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffManquant(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    await session.submitBlurting(userId, cycle.id, "Ma restitution.");

    (fetch as ReturnType<typeof vi.fn>).mockClear();
    const current = await session.getCurrentCorrection(userId, cycle.id);

    expect(fetch).not.toHaveBeenCalled();
    if (current.status !== "ready") throw new Error("attendu: ready");
    expect(current.verdict).toBe("insuffisant");
    expect(current.diff[0]).toEqual({
      intitule: "Point critique",
      type: "critique",
      statut: "manquant",
      attendu: "SECRET attendu Point critique",
      explication: "SECRET explication 1",
    });
  });
});

describe("session · S4 validateSection — auto-note FSRS (fusion Machine B/C, 2026-07-15)", () => {
  // Depuis la fusion, une révision traverse le cycle complet (Feynman compris) —
  // remplace l'ancien submitRevisionBlurting+rateRevision par un cycle entier.
  async function completeRevisionCycle(sec: { id: string }, note: Note) {
    const cycle = await session.start(userId, sec.id);
    await session.terminerLecture(userId, cycle.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffCouvert(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    await session.submitBlurting(userId, cycle.id, "Rappel de révision.");
    await enterFeynman(cycle);
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

  it("divulgation complète d'emblée en révision, quel que soit le verdict (ARCHITECTURE §6)", async () => {
    const sec = await createRevisionSection();
    const cycle = await session.start(userId, sec.id);
    await session.terminerLecture(userId, cycle.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffManquant(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    const result = await session.submitBlurting(userId, cycle.id, "Rappel incomplet.");

    expect(result.verdict).toBe("insuffisant");
    expect(JSON.stringify(result)).toContain("SECRET");
  });

  it("note Again : FSRS mis à jour, re-file intra-journée, cycle fermé, section reste en_revision", async () => {
    const sec = await createRevisionSection();

    const cycle = await completeRevisionCycle(sec, "again");

    const closed = await db.query.studyCycle.findFirst({ where: eq(studyCycle.id, cycle.id) });
    expect(closed?.closedAt).not.toBeNull();

    const refile = await client`select * from refile_item where item_id = ${sec.id} and item_type = 'revision'`;
    expect(refile).toHaveLength(1);

    const updatedSection = await db.query.section.findFirst({ where: eq(section.id, sec.id) });
    expect(updatedSection?.statut).toBe("en_revision");
  });

  it("2 Again consécutifs : la section reste en_revision (mécanisme de retour à l'étude complète retiré, fusion Machine B/C)", async () => {
    const sec = await createRevisionSection();

    await completeRevisionCycle(sec, "again");
    await completeRevisionCycle(sec, "again");

    const updatedSection = await db.query.section.findFirst({ where: eq(section.id, sec.id) });
    expect(updatedSection?.statut).toBe("en_revision");

    const refileRows = await client`select * from refile_item where item_id = ${sec.id} and item_type = 'revision'`;
    expect(refileRows).toHaveLength(2); // une par Again, aucun traitement spécial au 2e
  });

  it("note non-Again : ferme le cycle sans re-file", async () => {
    const sec = await createRevisionSection();

    const cycle = await completeRevisionCycle(sec, "good");

    const closed = await db.query.studyCycle.findFirst({ where: eq(studyCycle.id, cycle.id) });
    expect(closed?.closedAt).not.toBeNull();

    const refile = await client`select * from refile_item where item_id = ${sec.id}`;
    expect(refile).toHaveLength(0);
  });
});

describe("session · S4 transcribe", () => {
  function mockTranscriptionResponse(content: string) {
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    };
  }

  it("transcrit l'audio en s'appuyant sur le glossaire de la section (titre + gras)", async () => {
    const [sec] = await db
      .insert(section)
      .values({
        chapterId,
        chapterVersion: 1,
        titre: "Les conditions générales",
        ordre: 1,
        niveauSource: 1,
        contenu: "...",
        importance: 3,
        statut: "active",
        segmentsGras: [{ text: "article 1119", start: 0, end: 12, ambiguous: false }],
      })
      .returning();
    const created = await guide.createManual(userId, sec.id);
    await guide.validate(userId, created.id, [point("critique")]);
    const cycle = await session.start(userId, sec.id);

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockTranscriptionResponse("Article 1119 du Code civil."));

    const transcript = await session.transcribe(userId, cycle.id, "QUJD", "mp3");

    expect(transcript).toBe("Article 1119 du Code civil.");
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.messages[0].content[0].text).toContain("Les conditions générales");
    expect(body.messages[0].content[0].text).toContain("article 1119");
  });

  it("refuse un cycle qui n'appartient pas à l'utilisateur", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    const otherUserId = await createUser();

    await expect(session.transcribe(otherUserId, cycle.id, "QUJD", "mp3")).rejects.toThrow(session.NoCycleOpenError);
  });
});

describe("session · S4 beginFeynman + openingTurn", () => {
  it("refuse de quitter la correction si le cycle n'y est pas", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    await expect(session.beginFeynman(userId, cycle.id)).rejects.toThrow(session.WrongCycleStateError);
  });

  it("streame le tour d'ouverture et passe le cycle en état feynman", async () => {
    const { cycle } = await readyForFeynman();

    const text = await enterFeynman(cycle, ["Explique", "-moi ce point."]);

    expect(text).toBe("Explique-moi ce point.");
    const updated = await db.query.studyCycle.findFirst({ where: eq(studyCycle.id, cycle.id) });
    expect(updated?.etat).toBe("feynman");
  });

  it("accepte un verdict insuffisant sans confirmation ni journalisation (rupture C, REVAMP v2)", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    await session.terminerLecture(userId, cycle.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockCorrectionResponse({ diff: [diffManquant(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    await session.submitBlurting(userId, cycle.id, "Restitution incomplète.");
    const blurtingSession = (await db.query.studySession.findFirst({ where: eq(studySession.cycleId, cycle.id) }))!;

    await enterFeynman(cycle, ["Quand même, explique."]);

    const updated = await db.query.studyCycle.findFirst({ where: eq(studyCycle.id, cycle.id) });
    expect(updated?.etat).toBe("feynman");

    const events = await client`select * from audit_event where entite_id = ${blurtingSession.id}`;
    expect(events.some((e) => e.type === "override_verdict")).toBe(false);
  });
});

describe("session · S4 feynmanTurn", () => {
  it("refuse si le cycle n'est pas en dialogue Feynman", async () => {
    const { cycle } = await readyForFeynman();
    await expect(drain(session.feynmanTurn(userId, cycle.id, "Ma réponse."))).rejects.toThrow(
      session.WrongCycleStateError,
    );
  });

  it("persiste le tour étudiant et streame la relance suivante", async () => {
    const { cycle } = await readyForFeynman();
    await enterFeynman(cycle);

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockStreamResponse(["Et pourquoi donc ?"]));
    const text = await drain(session.feynmanTurn(userId, cycle.id, "Voici mon explication."));

    expect(text).toBe("Et pourquoi donc ?");
    const rows = await db.query.studySession.findMany({
      where: eq(studySession.cycleId, cycle.id),
      orderBy: (s, { asc }) => [asc(s.createdAt)],
    });
    const tours = rows.filter((r) => r.type === "feynman");
    expect(tours).toHaveLength(2);
    expect(tours[1].input).toBe("Voici mon explication.");
  });

  it("injecte le dernier brouillon de blurting dans le contexte L4 (REVAMP v2)", async () => {
    const { cycle } = await readyForFeynman(); // blurting soumis : "Restitution parfaite."
    await enterFeynman(cycle);

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockStreamResponse(["Et pourquoi donc ?"]));
    await drain(session.feynmanTurn(userId, cycle.id, "Voici mon explication."));

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const body = JSON.parse(calls[calls.length - 1][1].body);
    expect(body.messages[0].content).toContain("Restitution parfaite.");
  });
});

describe("session · S4 feynmanHistorique", () => {
  it("renvoie l'historique déjà persisté, sans appel LLM", async () => {
    const { cycle } = await readyForFeynman();
    await enterFeynman(cycle, ["Explique-moi."]);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockStreamResponse(["Et pourquoi donc ?"]));
    await drain(session.feynmanTurn(userId, cycle.id, "Voici mon explication."));

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    const historique = await session.feynmanHistorique(userId, cycle.id);

    expect(fetch).toHaveBeenCalledTimes(calls); // lecture pure, aucun appel LLM en plus
    expect(historique).toEqual([
      { role: "ia", texte: "Explique-moi." },
      { role: "etudiant", texte: "Voici mon explication." },
      { role: "ia", texte: "Et pourquoi donc ?" },
    ]);
  });

  it("renvoie un tableau vide si aucun tour n'a encore eu lieu", async () => {
    const { cycle } = await readyForFeynman();
    await session.beginFeynman(userId, cycle.id);

    expect(await session.feynmanHistorique(userId, cycle.id)).toEqual([]);
  });
});

describe("session · S4 closeFeynman", () => {
  it("calcule le verdict depuis les statuts par point et transitionne vers bilan", async () => {
    const { cycle } = await readyForFeynman();
    await enterFeynman(cycle);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockStreamResponse(["Suite."]));
    await drain(session.feynmanTurn(userId, cycle.id, "Ma réponse."));

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockBilanResponse({
        points: [
          { point_index: 1, statut: "demontre", commentaire: "clair" },
          { point_index: 2, statut: "recite", commentaire: "sans le pourquoi" },
        ],
        points_solides: ["Point 1"],
        lacunes: ["Point 2"],
      }),
    );

    const bilan = await session.closeFeynman(userId, cycle.id);

    expect(bilan.verdict).toBe("acquis"); // seul le point 1 est critique et démontré
    const updated = await db.query.studyCycle.findFirst({ where: eq(studyCycle.id, cycle.id) });
    expect(updated?.etat).toBe("bilan");
    expect((updated?.bilanFeynman as typeof bilan).verdict).toBe("acquis");
  });
});

describe("session · S4 validateSection — Feynman obligatoire (REVAMP v2, rupture E)", () => {
  it("refuse de valider directement depuis la correction, quelle que soit l'importance", async () => {
    const { cycle } = await readyForFeynman();
    await expect(session.validateSection(userId, cycle.id, "good")).rejects.toThrow(session.WrongCycleStateError);
  });

  it("ferme le cycle sur bilan acquis, section validee → en_revision, ReviewCard créée", async () => {
    const { cycle, sec } = await readyForFeynman();
    await enterFeynman(cycle);
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

    await session.validateSection(userId, cycle.id, "good");

    const closed = await db.query.studyCycle.findFirst({ where: eq(studyCycle.id, cycle.id) });
    expect(closed?.closedAt).not.toBeNull();

    const updatedSection = await db.query.section.findFirst({ where: eq(section.id, sec.id) });
    expect(updatedSection?.statut).toBe("en_revision");

    const card = await db.query.reviewCard.findFirst({ where: (r, { eq: eqOp }) => eqOp(r.sectionId, sec.id) });
    expect(card).toBeTruthy();
    expect(card?.gelee).toBe(false);
  });

  it("refuse un bilan insuffisant sans override, accepte avec override (journalisé)", async () => {
    const { cycle } = await readyForFeynman();
    await enterFeynman(cycle);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockBilanResponse({
        points: [
          { point_index: 1, statut: "non_aborde", commentaire: "jamais traité" },
          { point_index: 2, statut: "demontre", commentaire: "clair" },
        ],
        points_solides: [],
        lacunes: ["Point 1"],
      }),
    );
    await session.closeFeynman(userId, cycle.id);

    await expect(session.validateSection(userId, cycle.id, "good")).rejects.toThrow(session.WrongCycleStateError);

    await session.validateSection(userId, cycle.id, "good", true);
    const events = await client`select * from audit_event where entite_id = ${cycle.id} and type = 'validation_sur_insuffisant'`;
    expect(events).toHaveLength(1);
  });
});

describe("session · S4 beginRestartFeynman + returnToBlurting", () => {
  async function toBilan() {
    const { cycle } = await readyForFeynman();
    await enterFeynman(cycle);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockBilanResponse({
        points: [
          { point_index: 1, statut: "non_aborde", commentaire: "jamais traité" },
          { point_index: 2, statut: "demontre", commentaire: "clair" },
        ],
        points_solides: [],
        lacunes: ["Point 1"],
      }),
    );
    await session.closeFeynman(userId, cycle.id);
    return cycle;
  }

  it("beginRestartFeynman reprend le même cycle, remet bilan à null ; openingTurn streame avec l'historique préservé", async () => {
    const cycle = await toBilan();

    await session.beginRestartFeynman(userId, cycle.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockStreamResponse(["Reprenons."]));
    const text = await drain(session.openingTurn(userId, cycle.id));

    expect(text).toBe("Reprenons.");
    const updated = await db.query.studyCycle.findFirst({ where: eq(studyCycle.id, cycle.id) });
    expect(updated?.etat).toBe("feynman");
    expect(updated?.bilanFeynman).toBeNull();

    const tours = await db.query.studySession.findMany({ where: eq(studySession.cycleId, cycle.id) });
    expect(tours.filter((t) => t.type === "feynman")).toHaveLength(2); // ouverture initiale + reprise

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const body = JSON.parse(calls[calls.length - 1][1].body);
    expect(body.messages[0].content).toContain("IA : Ouverture."); // historique de l'AVANT-restart, pas oublié
  });

  it("returnToBlurting ferme le cycle et re-file la section en étude", async () => {
    const cycle = await toBilan();

    await session.returnToBlurting(userId, cycle.id);

    const closed = await db.query.studyCycle.findFirst({ where: eq(studyCycle.id, cycle.id) });
    expect(closed?.closedAt).not.toBeNull();
    expect(closed?.etat).toBe("clos");

    const refile = await client`select * from refile_item where item_id = ${closed!.sectionId} and item_type = 'etude'`;
    expect(refile).toHaveLength(1);
  });
});
