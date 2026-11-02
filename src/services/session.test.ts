import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as session from "./session";
import * as review from "./review";
import { client, cleanupAll, seedSet } from "@/test/fixtures";

// SessionService — cycle unique avec auto-évaluation (ARCHITECTURE.md v2 §2),
// Postgres réel, aucun LLM. Fiche 1 du set d'exemple : 3 points (thèse,
// définition, cause) ; le complément hors cours n'en est pas un.

let userId: string;
let ficheId: string;
let fiches: { id: string }[];

beforeEach(async () => {
  const s = await seedSet();
  userId = s.userId;
  fiches = s.fiches;
  ficheId = s.fiches[0].id;
});

afterAll(async () => {
  await cleanupAll();
});

async function cycleRow(cycleId: string) {
  const [row] = await client`select * from study_cycle where id = ${cycleId}`;
  return row;
}

async function jusquaComparaison() {
  const cycle = await session.start(userId, ficheId);
  if (cycle.etat === "lecture") await session.terminerLecture(userId, cycle.id);
  await session.submitBlurting(userId, cycle.id, "ma restitution");
  return { cycleId: cycle.id };
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

describe("session · blurting et comparaison", () => {
  it("submitBlurting refusé pendant la lecture", async () => {
    const cycle = await session.start(userId, ficheId);
    await expect(session.submitBlurting(userId, cycle.id, "x")).rejects.toThrow(session.WrongCycleStateError);
  });

  it("submitBlurting enregistre la tentative et passe à la comparaison, sans appel réseau", async () => {
    const { cycleId } = await jusquaComparaison();
    expect(await cycleRow(cycleId)).toMatchObject({ etat: "correction" });
    const [t] = await client`select numero, input, correction, verdict from tentative where cycle_id = ${cycleId}`;
    expect(t).toMatchObject({ numero: 1, input: "ma restitution", correction: null, verdict: null });
  });

  it("getComparaison : restitution, fiche, points (sans complément) et erreurs connues", async () => {
    const { cycleId } = await jusquaComparaison();
    const c = await session.getComparaison(userId, cycleId);
    expect(c).toMatchObject({ numero: 1, input: "ma restitution", erreursConnues: [] });
    expect(c.contenu).toContain("Complément (hors cours)");
    expect(c.points.map((p) => p.etiquette)).toEqual(["Thèse", "Définition", "Cause"]);
  });

  it("les erreurs actives de la fiche remontent dans la comparaison", async () => {
    const { cycleId } = await jusquaComparaison();
    const { tentativeId } = await session.getComparaison(userId, cycleId);
    await client`insert into error_entry (subject_id, fiche_id, tentative_id, type, description)
      select fs.subject_id, f.id, ${tentativeId}, 'confusion', 'confond retenue et déléguée'
      from fiche f join fiche_set fs on fs.id = f.set_id where f.id = ${ficheId}`;
    const c = await session.getComparaison(userId, cycleId);
    expect(c.erreursConnues).toEqual([{ type: "confusion", description: "confond retenue et déléguée", occurrences: 1 }]);
  });
});

describe("session · relecture et 2ᵉ passe", () => {
  it("relire enregistre les cases cochées et le verdict, puis retourne à la lecture", async () => {
    const { cycleId } = await jusquaComparaison();
    await session.relire(userId, cycleId, [1, 2, 2, 9]);
    const [t] = await client`select correction, verdict from tentative where cycle_id = ${cycleId}`;
    expect(t).toEqual({ correction: { coches: [1, 2] }, verdict: "insuffisant" });
    expect(await cycleRow(cycleId)).toMatchObject({ etat: "lecture" });
  });

  it("2ᵉ passe possible après relecture, puis plus de relecture", async () => {
    const { cycleId } = await jusquaComparaison();
    await session.relire(userId, cycleId);
    await session.terminerLecture(userId, cycleId);
    await session.submitBlurting(userId, cycleId, "seconde");
    expect((await session.getComparaison(userId, cycleId)).numero).toBe(2);
    await expect(session.relire(userId, cycleId)).rejects.toThrow(session.WrongCycleStateError);
  });

  it("notesPermises : les 4 à la tentative 1", async () => {
    const { cycleId } = await jusquaComparaison();
    expect(await session.notesPermises(cycleId)).toEqual(["again", "hard", "good", "easy"]);
  });
});

describe("session · clôture", () => {
  it("noter : enregistre les cases, crée la carte, passe la fiche en révision, ferme le cycle avec la note", async () => {
    const { cycleId } = await jusquaComparaison();
    await session.noter(userId, cycleId, "good", [0, 1]);
    const [t] = await client`select correction, verdict from tentative where cycle_id = ${cycleId}`;
    expect(t).toEqual({ correction: { coches: [0, 1] }, verdict: "bon" });

    const [f] = await client`select statut from fiche where id = ${ficheId}`;
    expect(f.statut).toBe("en_revision");
    const [card] = await client`select reps from review_card where fiche_id = ${ficheId}`;
    expect(card.reps).toBe(1);
    expect(await cycleRow(cycleId)).toMatchObject({ etat: "clos", note: "good" });
    expect(await session.findOpenCycle(userId)).toBeNull();
  });

  it("noter again ⇒ re-file du jour", async () => {
    const { cycleId } = await jusquaComparaison();
    await session.noter(userId, cycleId, "again");
    const rows = await client`select item_type from refile_item where item_id = ${ficheId}`;
    expect(rows.map((r) => r.item_type)).toEqual(["etude"]);
  });

  it("noter sur une carte existante la note sans en recréer", async () => {
    await review.createOrRate(userId, ficheId, "good");
    await client`update fiche set statut = 'en_revision' where id = ${ficheId}`;
    const { cycleId } = await jusquaComparaison();
    await session.noter(userId, cycleId, "good");
    const rows = await client`select reps from review_card where fiche_id = ${ficheId}`;
    expect(rows).toEqual([{ reps: 2 }]);
  });

  it("noter refusé avant la comparaison", async () => {
    const cycle = await session.start(userId, ficheId);
    await expect(session.noter(userId, cycle.id, "good")).rejects.toThrow(session.WrongCycleStateError);
  });

  it("abandon : ferme sans note, sans carte, la fiche reste nouvelle", async () => {
    const { cycleId } = await jusquaComparaison();
    await session.abandon(userId, cycleId);
    expect(await cycleRow(cycleId)).toMatchObject({ etat: "clos", note: null });
    expect(await client`select 1 from review_card where fiche_id = ${ficheId}`).toEqual([]);
    const [f] = await client`select statut from fiche where id = ${ficheId}`;
    expect(f.statut).toBe("nouvelle");
    await expect(session.abandon(userId, cycleId)).rejects.toThrow(session.NoCycleOpenError);
  });

  it("une autre fiche peut démarrer une fois la session close", async () => {
    const { cycleId } = await jusquaComparaison();
    await session.abandon(userId, cycleId);
    await expect(session.start(userId, fiches[1].id)).resolves.toMatchObject({ ficheId: fiches[1].id });
  });
});
