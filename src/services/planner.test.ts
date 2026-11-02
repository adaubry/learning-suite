import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as planner from "./planner";
import { client, cleanupAll, createSubject, createUser } from "@/test/fixtures";
import type { QueueItem } from "@/core/planner/buildDailyQueue";

// PlannerService — Postgres réel, pas de LLM. refile_item/deferral_log/queue_order
// sont mono-utilisateur (pas de user_id) : une date dédiée par test évite les
// interférences entre fichiers de test qui tournent en parallèle.

const TODAY = "2026-07-20";

let userId: string;
let subjectId: string;
let setId: string;
let numero = 0;

beforeEach(async () => {
  userId = await createUser();
  subjectId = (await createSubject(userId)).id;
  const [set] = await client`insert into fiche_set (subject_id, titre, markdown) values (${subjectId}, 'Set', '') returning id`;
  setId = set.id;
});

afterAll(async () => {
  await client`delete from queue_order where date in ('2026-07-08', '2026-07-12', '2026-07-25')`;
  await cleanupAll();
});

async function insertFiche(statut: "nouvelle" | "en_revision" | "archivee" = "nouvelle", titre = "Fiche") {
  numero += 1;
  const [f] = await client`insert into fiche (set_id, numero, titre, contenu, content_hash, statut) values (${setId}, ${numero}, ${titre}, 'Thèse.', 'h', ${statut}) returning id`;
  return f.id as string;
}

async function insertCard(ficheId: string, due: string, gelee = false) {
  await client`insert into review_card (fiche_id, due, stability, difficulty, reps, gelee) values (${ficheId}, ${due}, 1, 5, 1, ${gelee})`;
}

const ids = (queue: QueueItem[]) => queue.map((i) => (i.kind === "re_file" ? i.itemId : i.ficheId));

describe("planner · todayQueue", () => {
  it("file vide sans données", async () => {
    expect(await planner.todayQueue(userId, TODAY)).toEqual([]);
  });

  it("fiche nouvelle ⇒ nouvelle_etude ; archivée ⇒ absente", async () => {
    const f = await insertFiche("nouvelle");
    await insertFiche("archivee");
    expect(await planner.todayQueue(userId, TODAY)).toEqual([
      expect.objectContaining({ kind: "nouvelle_etude", ficheId: f }),
    ]);
  });

  it("carte due et non gelée ⇒ revision ; gelée ⇒ absente", async () => {
    const f1 = await insertFiche("en_revision");
    const f2 = await insertFiche("en_revision");
    await insertCard(f1, TODAY);
    await insertCard(f2, TODAY, true);
    expect(await planner.todayQueue(userId, TODAY)).toEqual([expect.objectContaining({ kind: "revision", ficheId: f1 })]);
  });

  it("matière ou set archivé ⇒ rien dans la file", async () => {
    await insertFiche("nouvelle");
    await client`update fiche_set set statut = 'archive' where id = ${setId}`;
    expect(await planner.todayQueue(userId, TODAY)).toEqual([]);
  });

  it("nouvelles fiches dans l'ordre des numéros, plafonnées", async () => {
    const [a, b, c] = [await insertFiche(), await insertFiche(), await insertFiche()];
    await insertFiche();
    expect(ids(await planner.todayQueue(userId, TODAY))).toEqual([a, b, c]);
  });

  it("une nouvelle fiche étudiée aujourd'hui consomme son slot : le plafond tient", async () => {
    const [a, b, c, d] = [await insertFiche(), await insertFiche(), await insertFiche(), await insertFiche()];
    // `a` étudiée et notée aujourd'hui : elle passe en révision (carte due demain).
    await client`update fiche set statut = 'en_revision' where id = ${a}`;
    await insertCard(a, "2026-07-21");
    await client`insert into study_cycle (user_id, fiche_id, type, etat, note, closed_at) values (${userId}, ${a}, 'etude', 'clos', 'good', ${`${TODAY}T10:00:00Z`})`;
    // Abandonnée (note nulle) : ne consomme rien.
    await client`insert into study_cycle (user_id, fiche_id, type, etat, closed_at) values (${userId}, ${b}, 'etude', 'clos', ${`${TODAY}T11:00:00Z`})`;
    expect(ids(await planner.todayQueue(userId, TODAY))).toEqual([b, c]);
    expect(ids(await planner.todayQueue(userId, "2026-07-21"))).toEqual([a, b, c, d]);
  });

  it("defer(etude) : le slot du jour est perdu, jamais remplacé", async () => {
    const [a, b, c] = [await insertFiche(), await insertFiche(), await insertFiche()];
    await insertFiche();
    const date = "2026-07-13";
    await planner.defer("etude", a, date);
    expect(ids(await planner.todayQueue(userId, date))).toEqual([b, c]);
  });

  it("refile ⇒ item re_file en fin de file", async () => {
    const f = await insertFiche();
    const date = "2026-07-11";
    await planner.refile("etude", f, date);
    expect((await planner.todayQueue(userId, date)).at(-1)).toEqual({ kind: "re_file", itemType: "etude", itemId: f });
  });

  it("reorder : la permutation stockée prime", async () => {
    const date = "2026-07-12";
    const [a, b] = [await insertFiche(), await insertFiche()];
    expect(ids(await planner.todayQueue(userId, date))).toEqual([a, b]);
    await planner.reorder([`nouvelle_etude:${b}`, `nouvelle_etude:${a}`], date);
    expect(ids(await planner.todayQueue(userId, date))).toEqual([b, a]);
  });
});

describe("planner · avancer une fiche de demain", () => {
  it("nextBacklogCandidate : première nouvelle fiche par ordre ; null si aucune", async () => {
    expect(await planner.nextBacklogCandidate(userId, "2026-07-14")).toBeNull();
    const a = await insertFiche("nouvelle", "Première");
    await insertFiche("nouvelle", "Seconde");
    expect(await planner.nextBacklogCandidate(userId, "2026-07-14")).toEqual({ ficheId: a, titre: "Première" });
  });

  it("advanceFromBacklog consomme un slot de DEMAIN, jamais aujourd'hui", async () => {
    const [a, b] = [await insertFiche(), await insertFiche()];
    await planner.advanceFromBacklog(a, "2026-07-16");
    expect(ids(await planner.todayQueue(userId, "2026-07-16"))).toEqual([a, b]);

    const c = await insertFiche();
    await insertFiche();
    expect(ids(await planner.todayQueue(userId, "2026-07-17"))).toEqual([b, c]);
  });
});

describe("planner · horizon et prochaine échéance", () => {
  it("horizon sur les cartes actives (gelées exclues)", async () => {
    const f1 = await insertFiche("en_revision");
    const f2 = await insertFiche("en_revision");
    await insertCard(f1, TODAY);
    await insertCard(f2, TODAY, true);
    expect((await planner.horizon(userId, TODAY)).chargeJ7).toBe(1);
  });

  it("nextDeadline : due la plus proche parmi les cartes actives ; null si aucune", async () => {
    expect(await planner.nextDeadline(userId)).toBeNull();
    const [f1, f2, f3] = [await insertFiche("en_revision"), await insertFiche("en_revision"), await insertFiche("en_revision")];
    await insertCard(f1, "2026-07-15");
    await insertCard(f2, "2026-07-12", true);
    await insertCard(f3, "2026-07-20");
    expect(await planner.nextDeadline(userId)).toBe("2026-07-15");
  });
});

describe("planner · purgeExpired", () => {
  it("supprime refile_item et queue_order antérieurs à la date, garde le jour et le futur", async () => {
    const f = await insertFiche();
    await client`insert into refile_item (date, item_type, item_id) values ('2026-07-08', 'etude', ${f}), (${TODAY}, 'etude', ${f})`;
    await client`insert into queue_order (date, "order") values ('2026-07-08', '["a"]'), ('2026-07-25', '["b"]') on conflict do nothing`;

    await planner.purgeExpired(TODAY);

    const refile = await client`select date::text as date from refile_item where item_id = ${f}`;
    expect(refile.map((r) => r.date)).toEqual([TODAY]);
    const orders = await client`select date::text as date from queue_order where date in ('2026-07-08', '2026-07-25')`;
    expect(orders.map((r) => r.date)).toEqual(["2026-07-25"]);
  });
});
