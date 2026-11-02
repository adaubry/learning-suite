import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as session from "./session";
import * as review from "./review";
import { client, cleanupAll, seedSet } from "@/test/fixtures";

// SessionService — cycle unique (ARCHITECTURE.md v2 §2). LLM mocké (fetch
// intercepté), Postgres réel. Fiche 1 du set d'exemple : 3 points (thèse,
// définition, cause).

const MODEL = "test/session";

function llmReply(statuts: ("couvert" | "manquant" | "deforme")[], erreurs: object[] = []) {
  return {
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              diff: statuts.map((statut, i) => ({ point_index: i + 1, statut, explication: "x" })),
              erreurs_candidates: erreurs,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }),
  };
}

const fetchMock = () => fetch as ReturnType<typeof vi.fn>;
const TOUT_COUVERT = llmReply(["couvert", "couvert", "couvert"]);
const THESE_MANQUANTE = llmReply(["manquant", "couvert", "couvert"]);

let userId: string;
let ficheId: string;
let fiches: { id: string }[];

beforeEach(async () => {
  process.env.LLM_MODEL_CORRECTION_ERREURS = MODEL;
  vi.stubGlobal("fetch", vi.fn());
  const s = await seedSet();
  userId = s.userId;
  fiches = s.fiches;
  ficheId = s.fiches[0].id;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await client`delete from prompt_log where model = ${MODEL}`;
  await cleanupAll();
});

async function cycleRow(cycleId: string) {
  const [row] = await client`select * from study_cycle where id = ${cycleId}`;
  return row;
}

async function jusquaCorrection(reply = TOUT_COUVERT) {
  const cycle = await session.start(userId, ficheId);
  if (cycle.etat === "lecture") await session.terminerLecture(userId, cycle.id);
  fetchMock().mockResolvedValueOnce(reply);
  const correction = await session.submitBlurting(userId, cycle.id, "ma restitution");
  return { cycleId: cycle.id, correction };
}

describe("session · démarrage", () => {
  it("nouvelle fiche : commence à la lecture, type etude", async () => {
    const cycle = await session.start(userId, ficheId);
    expect(cycle).toMatchObject({ etat: "lecture", type: "etude" });
  });

  it("fiche en révision : commence au blurting (rappel à froid), type revision", async () => {
    await client`update fiche set statut = 'en_revision' where id = ${ficheId}`;
    const cycle = await session.start(userId, ficheId);
    expect(cycle).toMatchObject({ etat: "blurting", type: "revision" });
  });

  it("reprend le cycle ouvert sur la même fiche", async () => {
    const a = await session.start(userId, ficheId);
    const b = await session.start(userId, ficheId);
    expect(b.id).toBe(a.id);
  });

  it("refuse une fiche archivée", async () => {
    await client`update fiche set statut = 'archivee' where id = ${ficheId}`;
    await expect(session.start(userId, ficheId)).rejects.toThrow(session.FicheNonEtudiableError);
  });

  it("findOpenCycle : la session ouverte et le titre de sa fiche", async () => {
    expect(await session.findOpenCycle(userId)).toBeNull();
    const cycle = await session.start(userId, ficheId);
    expect(await session.findOpenCycle(userId)).toEqual({
      cycleId: cycle.id,
      ficheId,
      ficheTitre: "La justice retenue",
      type: "etude",
    });
  });
});

describe("session · blurting et correction", () => {
  it("submitBlurting refusé pendant la lecture", async () => {
    const cycle = await session.start(userId, ficheId);
    await expect(session.submitBlurting(userId, cycle.id, "x")).rejects.toThrow(session.WrongCycleStateError);
  });

  it("correction : points résolus en code, verdict bon si les critiques sont couverts", async () => {
    const { correction } = await jusquaCorrection(llmReply(["couvert", "couvert", "manquant"]));
    expect(correction.verdict).toBe("bon");
    expect(correction.points.map((p) => [p.etiquette, p.statut])).toEqual([
      ["Thèse", "couvert"],
      ["Définition", "couvert"],
      ["Cause", "manquant"],
    ]);
  });

  it("verdict insuffisant si un point critique manque", async () => {
    const { correction } = await jusquaCorrection(THESE_MANQUANTE);
    expect(correction.verdict).toBe("insuffisant");
  });

  it("les compléments hors cours ne sont jamais envoyés au LLM", async () => {
    await jusquaCorrection();
    const body = JSON.parse(fetchMock().mock.calls[0][1].body);
    expect(body.messages[0].content).not.toContain("art. 52");
  });

  it("tentative sauvegardée AVANT l'appel LLM : échec ⇒ ligne sans correction, retryCorrection la rejoue", async () => {
    const cycle = await session.start(userId, ficheId);
    await session.terminerLecture(userId, cycle.id);
    fetchMock().mockRejectedValue(new Error("réseau"));
    await expect(session.submitBlurting(userId, cycle.id, "texte précieux")).rejects.toThrow();

    const rows = await client`select input, correction from tentative where cycle_id = ${cycle.id}`;
    expect(rows).toEqual([{ input: "texte précieux", correction: null }]);
    expect(await session.getCurrentCorrection(userId, cycle.id)).toEqual({ status: "pending", numero: 1 });

    fetchMock().mockReset();
    fetchMock().mockResolvedValueOnce(TOUT_COUVERT);
    const ok = await session.retryCorrection(userId, cycle.id);
    expect(ok.verdict).toBe("bon");
    const current = await session.getCurrentCorrection(userId, cycle.id);
    expect(current).toMatchObject({ status: "ready", numero: 1, input: "texte précieux", verdict: "bon" });
    expect(await client`select id from tentative where cycle_id = ${cycle.id}`).toHaveLength(1);
  });

  it("récidive : recidive_index résolu vers l'erreur active de la fiche", async () => {
    const { subject } = await client`select subject_id from fiche_set where id = (select set_id from fiche where id = ${ficheId})`.then(
      ([r]) => ({ subject: r.subject_id }),
    );
    const { cycleId } = await jusquaCorrection();
    const [t] = await client`select id from tentative where cycle_id = ${cycleId}`;
    const [err] = await client`insert into error_entry (subject_id, fiche_id, tentative_id, type, description) values (${subject}, ${ficheId}, ${t.id}, 'confusion', 'ancienne') returning id`;
    await session.noter(userId, cycleId, "good");

    await client`update fiche set statut = 'en_revision' where id = ${ficheId}`;
    const { correction } = await jusquaCorrection(
      llmReply(["couvert", "couvert", "couvert"], [{ type: "confusion", description: "encore", recidive_index: 1 }]),
    );
    expect(correction.erreursCandidates).toEqual([{ type: "confusion", description: "encore", idErreurExistante: err.id }]);
  });
});

describe("session · relecture et 2ᵉ passe", () => {
  it("relire : retour à la lecture, 2ᵉ blurting possible, pas de 3ᵉ", async () => {
    const { cycleId } = await jusquaCorrection(THESE_MANQUANTE);
    await session.relire(userId, cycleId);
    expect((await cycleRow(cycleId)).etat).toBe("lecture");
    expect(await session.prochaineTentative(cycleId)).toBe(2);

    await session.terminerLecture(userId, cycleId);
    fetchMock().mockResolvedValueOnce(TOUT_COUVERT);
    const c2 = await session.submitBlurting(userId, cycleId, "mieux");
    expect(c2.verdict).toBe("bon");

    await expect(session.relire(userId, cycleId)).rejects.toThrow(session.WrongCycleStateError);
  });

  it("relire enregistre les erreurs candidates non rejetées", async () => {
    const { cycleId } = await jusquaCorrection(
      llmReply(["manquant", "couvert", "couvert"], [
        { type: "confusion", description: "garde" },
        { type: "imprecision", description: "rejetée" },
      ]),
    );
    await session.relire(userId, cycleId, [1]);
    const rows = await client`select description from error_entry where fiche_id = ${ficheId}`;
    expect(rows.map((r) => r.description)).toEqual(["garde"]);
  });

  it("notesPermises : les 4 à la tentative 1", async () => {
    const { cycleId } = await jusquaCorrection();
    expect(await session.notesPermises(cycleId)).toEqual(["again", "hard", "good", "easy"]);
  });
});

describe("session · clôture", () => {
  it("noter : crée la carte, passe la fiche en révision, ferme le cycle avec la note", async () => {
    const { cycleId } = await jusquaCorrection();
    await session.noter(userId, cycleId, "good");

    const [f] = await client`select statut from fiche where id = ${ficheId}`;
    expect(f.statut).toBe("en_revision");
    const [card] = await client`select reps from review_card where fiche_id = ${ficheId}`;
    expect(card.reps).toBe(1);
    expect(await cycleRow(cycleId)).toMatchObject({ etat: "clos", note: "good" });
    expect(await session.findOpenCycle(userId)).toBeNull();
  });

  it("noter again ⇒ re-file du jour", async () => {
    const { cycleId } = await jusquaCorrection();
    await session.noter(userId, cycleId, "again");
    const rows = await client`select item_type from refile_item where item_id = ${ficheId}`;
    expect(rows.map((r) => r.item_type)).toEqual(["etude"]);
  });

  it("noter sur une carte existante la note sans en recréer", async () => {
    await review.createOrRate(userId, ficheId, "good");
    await client`update fiche set statut = 'en_revision' where id = ${ficheId}`;
    const { cycleId } = await jusquaCorrection();
    await session.noter(userId, cycleId, "good");
    const rows = await client`select reps from review_card where fiche_id = ${ficheId}`;
    expect(rows).toEqual([{ reps: 2 }]);
  });

  it("noter refusé tant que la correction n'est pas prête", async () => {
    const cycle = await session.start(userId, ficheId);
    await expect(session.noter(userId, cycle.id, "good")).rejects.toThrow(session.WrongCycleStateError);
  });

  it("abandon : ferme sans note, sans carte, la fiche reste nouvelle", async () => {
    const { cycleId } = await jusquaCorrection();
    await session.abandon(userId, cycleId);
    expect(await cycleRow(cycleId)).toMatchObject({ etat: "clos", note: null });
    expect(await client`select 1 from review_card where fiche_id = ${ficheId}`).toEqual([]);
    const [f] = await client`select statut from fiche where id = ${ficheId}`;
    expect(f.statut).toBe("nouvelle");
    await expect(session.abandon(userId, cycleId)).rejects.toThrow(session.NoCycleOpenError);
  });

  it("une autre fiche peut démarrer une fois la session close", async () => {
    const { cycleId } = await jusquaCorrection();
    await session.abandon(userId, cycleId);
    await expect(session.start(userId, fiches[1].id)).resolves.toMatchObject({ ficheId: fiches[1].id });
  });
});
