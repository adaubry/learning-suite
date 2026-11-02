import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as account from "./account";
import * as review from "./review";
import * as ficheService from "./fiche";
import { client, cleanupAll, createUser, SAMPLE_SET } from "@/test/fixtures";

let userId: string;

beforeEach(async () => {
  userId = await createUser();
});

afterAll(cleanupAll);

async function card(ficheId: string) {
  const [row] = await client`select gelee, due::text as due from review_card where fiche_id = ${ficheId}`;
  return row;
}

async function setAvecCarte(subjectId: string) {
  const set = await ficheService.importSet(userId, { subjectId, titre: "Set", markdown: SAMPLE_SET });
  const [f] = await client`select id from fiche where set_id = ${set.id} order by numero limit 1`;
  await client`update fiche set statut = 'en_revision' where id = ${f.id}`;
  const created = await review.createOrRate(userId, f.id, "good");
  return { set, ficheId: f.id as string, due: created.due };
}

describe("account · matières", () => {
  it("createSubject assigne un ordre incrémental par utilisateur", async () => {
    const s1 = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
    const s2 = await account.createSubject(userId, { nom: "Droit pénal", semestre: "S1" });
    expect([s1.ordre, s2.ordre]).toEqual([1, 2]);
  });

  it("listSubjects trie par ordre et ignore les autres utilisateurs", async () => {
    const other = await createUser();
    await account.createSubject(other, { nom: "Autre", semestre: "S1" });
    await account.createSubject(userId, { nom: "B", semestre: "S1" });
    await account.createSubject(userId, { nom: "A", semestre: "S1" });
    expect((await account.listSubjects(userId)).map((s) => s.nom)).toEqual(["B", "A"]);
  });

  it("updateSubject modifie une matière, scoping par utilisateur", async () => {
    const other = await createUser();
    const s = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
    expect((await account.updateSubject(userId, s.id, { dateExamen: "2026-12-01" })).dateExamen).toBe("2026-12-01");
    expect(await account.updateSubject(other, s.id, { nom: "Piraté" })).toBeUndefined();
  });

  it("archiveSubject gèle les cartes ; unarchiveSubject dégèle et décale due de la durée du gel", async () => {
    const s = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
    const { ficheId, due } = await setAvecCarte(s.id);

    expect((await account.archiveSubject(userId, s.id)).statut).toBe("archivee");
    expect((await card(ficheId)).gelee).toBe(true);

    await client`update subject set archived_at = now() - interval '5 days' where id = ${s.id}`;
    expect((await account.unarchiveSubject(userId, s.id))?.statut).toBe("active");

    const apres = await card(ficheId);
    expect(apres.gelee).toBe(false);
    const attendu = new Date(`${due}T00:00:00Z`);
    attendu.setUTCDate(attendu.getUTCDate() + 5);
    expect(apres.due).toBe(attendu.toISOString().slice(0, 10));
  });

  it("archiver/désarchiver la matière ne dégèle pas un set archivé à part", async () => {
    const s = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
    const { set, ficheId } = await setAvecCarte(s.id);
    await ficheService.archiveSet(userId, set.id);

    await account.archiveSubject(userId, s.id);
    await account.unarchiveSubject(userId, s.id);
    expect((await card(ficheId)).gelee).toBe(true);
  });

  it("deleteSubject détruit sets, fiches et cartes, puis la matière", async () => {
    const s = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
    const { set, ficheId } = await setAvecCarte(s.id);
    await account.deleteSubject(userId, s.id);
    expect(await account.listSubjects(userId)).toHaveLength(0);
    expect(await client`select 1 from fiche_set where id = ${set.id}`).toEqual([]);
    expect(await client`select 1 from review_card where fiche_id = ${ficheId}`).toEqual([]);
  });

  it("deleteSubject refuse une matière d'un autre utilisateur", async () => {
    const s = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
    const other = await createUser();
    await expect(account.deleteSubject(other, s.id)).rejects.toThrow("Matière introuvable.");
    expect(await account.listSubjects(userId)).toHaveLength(1);
  });
});

describe("account · réglages", () => {
  it("getPlannerConfig renvoie le défaut tant qu'aucune ligne n'existe", async () => {
    expect(await account.getPlannerConfig(userId)).toMatchObject({ nouvellesParJour: 3, gelsSerieRestants: 2 });
  });

  it("updatePlannerConfig fait un upsert idempotent", async () => {
    await account.updatePlannerConfig(userId, 5);
    await account.updatePlannerConfig(userId, 2);
    expect((await account.getPlannerConfig(userId)).nouvellesParJour).toBe(2);
    expect(await client`select 1 from planner_config where user_id = ${userId}`).toHaveLength(1);
  });

  it("updateSemesterConfig enregistre les débuts de semestre", async () => {
    await account.updateSemesterConfig(userId, { debutS3: "2026-09-07" });
    expect((await account.getPlannerConfig(userId)).debutS3).toBe("2026-09-07");
  });
});
