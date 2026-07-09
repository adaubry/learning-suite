import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as account from "./account";
import * as guide from "./guide";
import * as session from "./session";
import { db } from "@/db";
import { chapter, section, studyCycle, studySession, auditEvent, errorEntry } from "@/db/schema";

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

// importance 2 par défaut (validation directe sans Feynman, PLAN Bloc 7.2) — les
// tests de la restriction « Feynman requis si importance ≥ 3 » passent 3 explicitement.
async function createReadySection(points = [point("critique"), point("important")], importance = 2) {
  const [sec] = await db
    .insert(section)
    .values({ chapterId, chapterVersion: 1, titre: "Sec", ordre: 1, niveauSource: 1, contenu: "...", importance, statut: "active" })
    .returning();
  const created = await guide.createManual(userId, sec.id);
  await guide.validate(userId, created.id, points);
  return sec;
}

// Section `en_revision` + ReviewCard due aujourd'hui — état d'entrée machine C.
async function createRevisionSection(points = [point("critique"), point("important")]) {
  const sec = await createReadySection(points);
  const cycle = await session.start(userId, sec.id);
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
    mockCorrectionResponse({ diff: [diffCouvert(1), diffCouvert(2)], erreurs_candidates: [] }),
  );
  await session.submitBlurting(userId, cycle.id, "Restitution parfaite.");
  await session.validateSection(userId, cycle.id);
  return db.query.section.findFirst({ where: eq(section.id, sec.id) }).then((s) => s!);
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

  it("section en_revision : ouvre un cycle de type revision (USER_FLOW É4.1)", async () => {
    const sec = await createRevisionSection();
    const cycle = await session.start(userId, sec.id);
    expect(cycle.type).toBe("revision");
    expect(cycle.etat).toBe("blurting");
  });

  it("refuse une révision sur une ReviewCard gelée", async () => {
    const sec = await createRevisionSection();
    const { freeze } = await import("./review");
    await freeze(userId, sec.id);
    await expect(session.start(userId, sec.id)).rejects.toThrow(session.SectionNotReadyError);
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
    // abandon (pas validateSection) : ce test porte sur la résolution de
    // recidive_index, pas sur la transition de section — juste besoin de
    // libérer le slot de session unique pour redémarrer sur la même section.
    await session.abandon(userId, firstCycle.id);

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

  it("commit les candidates non rejetées (S7.commitCandidates, Bloc 5.3)", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
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

    await session.resolveOutcome(userId, cycle.id, "retenter", [1]);

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

describe("session · S4 validateSection", () => {
  it("ferme le cycle sur verdict acquis, section validee → en_revision, ReviewCard créée", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffCouvert(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    await session.submitBlurting(userId, cycle.id, "Restitution parfaite.");

    await session.validateSection(userId, cycle.id);

    const closed = await db.query.studyCycle.findFirst({ where: eq(studyCycle.id, cycle.id) });
    expect(closed?.closedAt).not.toBeNull();

    const updatedSection = await db.query.section.findFirst({ where: eq(section.id, sec.id) });
    expect(updatedSection?.statut).toBe("en_revision");

    const card = await db.query.reviewCard.findFirst({ where: (r, { eq: eqOp }) => eqOp(r.sectionId, sec.id) });
    expect(card).toBeTruthy();
    expect(card?.gelee).toBe(false);
  });

  it("refuse sur un verdict insuffisant", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffManquant(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    await session.submitBlurting(userId, cycle.id, "Restitution incomplète.");

    await expect(session.validateSection(userId, cycle.id)).rejects.toThrow(session.WrongCycleStateError);
  });

  it("commit les candidates (auto-acceptation) même sur clôture acquis", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({
        diff: [diffCouvert(1), diffCouvert(2)],
        erreurs_candidates: [{ type: "confusion", description: "imprécision relevée quand même" }],
      }),
    );
    await session.submitBlurting(userId, cycle.id, "Restitution parfaite mais imprécise.");

    await session.validateSection(userId, cycle.id);

    const rows = await db.query.errorEntry.findMany({ where: eq(errorEntry.sectionId, sec.id) });
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("imprécision relevée quand même");
  });
});

describe("session · S4 retryCorrection", () => {
  it("rejoue L3 sur la tentative sauvegardée sans en créer une nouvelle", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
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
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("réseau down"));
    await expect(session.submitBlurting(userId, cycle.id, "Ma restitution.")).rejects.toThrow();

    const current = await session.getCurrentCorrection(userId, cycle.id);
    expect(current.status).toBe("pending");
  });

  it("status ready : ré-applique la même divulgation que celle déjà tranchée, sans nouvel appel LLM", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffManquant(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    await session.submitBlurting(userId, cycle.id, "Ma restitution.");

    (fetch as ReturnType<typeof vi.fn>).mockClear();
    const current = await session.getCurrentCorrection(userId, cycle.id);

    expect(fetch).not.toHaveBeenCalled();
    if (current.status !== "ready") throw new Error("attendu: ready");
    expect(current.verdict).toBe("insuffisant");
    expect(current.divulgation).toBe("controlee");
    expect(current.diff[0]).toEqual({ intitule: "Point critique", statut: "manquant" });
  });

  it("resolveOutcome('reveler') renvoie directement la vue complètement divulguée", async () => {
    // le cycle boucle vers `blurting` dans le même appel (cf. resolveOutcome) :
    // la vue révélée doit être renvoyée ICI, une relecture via
    // getCurrentCorrection arriverait trop tard (etat déjà changé).
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffManquant(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    await session.submitBlurting(userId, cycle.id, "Restitution incomplète.");

    const revealed = await session.resolveOutcome(userId, cycle.id, "reveler");
    if (revealed.outcome !== "reveler") throw new Error("attendu: reveler");
    expect(revealed.divulgation).toBe("complete");
    expect(revealed.diff[0]).toEqual({
      intitule: "Point critique",
      statut: "manquant",
      attendu: "SECRET attendu Point critique",
      explication: "SECRET explication 1",
    });

    await expect(session.getCurrentCorrection(userId, cycle.id)).rejects.toThrow(session.WrongCycleStateError);
  });
});

// Le canari correspondant (« Again ⇒ RefileItem du jour ; 2ᵉ Again consécutif ⇒
// section prete ») vit dans session.canary.test.ts (suffixe requis par
// CLAUDE.md §1 pour que `npm run test:canary` l'exécute réellement).
describe("session · S4 rateRevision", () => {
  async function submitRevisionBlurting(sec: { id: string }) {
    const cycle = await session.start(userId, sec.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffCouvert(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    await session.submitBlurting(userId, cycle.id, "Rappel de révision.");
    return cycle;
  }

  it("divulgation complète d'emblée en révision, quel que soit le verdict (ARCHITECTURE §6)", async () => {
    const sec = await createRevisionSection();
    const cycle = await session.start(userId, sec.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffManquant(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    const result = await session.submitBlurting(userId, cycle.id, "Rappel incomplet.");

    expect(result.verdict).toBe("insuffisant");
    expect(result.divulgation).toBe("complete");
    expect(JSON.stringify(result)).toContain("SECRET");
  });

  it("note Again : FSRS mis à jour, re-file intra-journée, cycle fermé, section reste en_revision", async () => {
    const sec = await createRevisionSection();
    const cycle = await submitRevisionBlurting(sec);

    await session.rateRevision(userId, cycle.id, "again");

    const closed = await db.query.studyCycle.findFirst({ where: eq(studyCycle.id, cycle.id) });
    expect(closed?.closedAt).not.toBeNull();

    const refile = await client`select * from refile_item where item_id = ${sec.id} and item_type = 'revision'`;
    expect(refile).toHaveLength(1);

    const updatedSection = await db.query.section.findFirst({ where: eq(section.id, sec.id) });
    expect(updatedSection?.statut).toBe("en_revision");
  });

  it("2ᵉ Again consécutif : section repasse prete, pas de nouvelle re-file", async () => {
    const sec = await createRevisionSection();

    const firstCycle = await submitRevisionBlurting(sec);
    await session.rateRevision(userId, firstCycle.id, "again");

    const secondCycle = await submitRevisionBlurting(sec);
    await session.rateRevision(userId, secondCycle.id, "again");

    const updatedSection = await db.query.section.findFirst({ where: eq(section.id, sec.id) });
    expect(updatedSection?.statut).toBe("prete");

    const refileRows = await client`select * from refile_item where item_id = ${sec.id} and item_type = 'revision'`;
    expect(refileRows).toHaveLength(1); // uniquement celle du 1er Again, pas une 2e
  });

  it("Again puis Good : la note Good remet le compteur consécutif à zéro", async () => {
    const sec = await createRevisionSection();

    const firstCycle = await submitRevisionBlurting(sec);
    await session.rateRevision(userId, firstCycle.id, "again");

    const secondCycle = await submitRevisionBlurting(sec);
    await session.rateRevision(userId, secondCycle.id, "good");

    const thirdCycle = await submitRevisionBlurting(sec);
    await session.rateRevision(userId, thirdCycle.id, "again");

    const updatedSection = await db.query.section.findFirst({ where: eq(section.id, sec.id) });
    expect(updatedSection?.statut).toBe("en_revision"); // pas 2 Again consécutifs (Good entre les deux)
  });

  it("note non-Again : ferme le cycle sans re-file", async () => {
    const sec = await createRevisionSection();
    const cycle = await submitRevisionBlurting(sec);

    await session.rateRevision(userId, cycle.id, "good");

    const closed = await db.query.studyCycle.findFirst({ where: eq(studyCycle.id, cycle.id) });
    expect(closed?.closedAt).not.toBeNull();

    const refile = await client`select * from refile_item where item_id = ${sec.id}`;
    expect(refile).toHaveLength(0);
  });

  it("refuse une note sur un cycle d'étude", async () => {
    const sec = await createReadySection();
    const cycle = await session.start(userId, sec.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockCorrectionResponse({ diff: [diffCouvert(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    await session.submitBlurting(userId, cycle.id, "Restitution.");

    await expect(session.rateRevision(userId, cycle.id, "good")).rejects.toThrow(session.WrongCycleStateError);
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

// Section importance 3 (Feynman requis), blurting acquis, cycle en `correction` —
// point de départ commun aux tests beginFeynman/feynmanTurn/closeFeynman.
async function readyForFeynman() {
  const sec = await createReadySection([point("critique"), point("important")], 3);
  const cycle = await session.start(userId, sec.id);
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
    mockCorrectionResponse({ diff: [diffCouvert(1), diffCouvert(2)], erreurs_candidates: [] }),
  );
  await session.submitBlurting(userId, cycle.id, "Restitution parfaite.");
  return { sec, cycle };
}

// beginFeynman (transition) + openingTurn (streaming) combinés — équivalent de
// l'ancien startFeynman unique, désormais scindé (route de streaming séparée
// du Server Action de transition, cf. DECISIONS.md bloc 7.2).
async function enterFeynman(
  cycle: { id: string },
  deltas: string[] = ["Ouverture."],
  rejectedCandidateIndexes: number[] = [],
  override = false,
) {
  await session.beginFeynman(userId, cycle.id, rejectedCandidateIndexes, override);
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockStreamResponse(deltas));
  return drain(session.openingTurn(userId, cycle.id));
}

describe("session · S4 beginFeynman + openingTurn", () => {
  it("refuse de quitter la correction si le cycle n'y est pas", async () => {
    const sec = await createReadySection([point("critique"), point("important")], 3);
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

  it("refuse un verdict insuffisant sans override, accepte avec override (journalisé)", async () => {
    const sec = await createReadySection([point("critique"), point("important")], 3);
    const cycle = await session.start(userId, sec.id);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockCorrectionResponse({ diff: [diffManquant(1), diffCouvert(2)], erreurs_candidates: [] }),
    );
    await session.submitBlurting(userId, cycle.id, "Restitution incomplète.");
    const blurtingSession = (await db.query.studySession.findFirst({ where: eq(studySession.cycleId, cycle.id) }))!;

    await expect(session.beginFeynman(userId, cycle.id)).rejects.toThrow(session.WrongCycleStateError);

    await enterFeynman(cycle, ["Quand même, explique."], [], true);

    const events = await client`select * from audit_event where entite_id = ${blurtingSession.id}`;
    expect(events.some((e) => e.type === "override_verdict")).toBe(true);
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

describe("session · S4 validateSection — restriction Feynman (importance ≥ 3)", () => {
  it("refuse de valider directement depuis la correction pour importance ≥ 3", async () => {
    const { cycle } = await readyForFeynman();
    await expect(session.validateSection(userId, cycle.id)).rejects.toThrow(session.WrongCycleStateError);
  });

  it("valide depuis un bilan acquis", async () => {
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

    await session.validateSection(userId, cycle.id);

    const updatedSection = await db.query.section.findFirst({ where: eq(section.id, sec.id) });
    expect(updatedSection?.statut).toBe("en_revision");
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

    await expect(session.validateSection(userId, cycle.id)).rejects.toThrow(session.WrongCycleStateError);

    await session.validateSection(userId, cycle.id, [], true);
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
