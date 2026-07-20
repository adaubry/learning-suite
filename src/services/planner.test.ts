import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as account from "./account";
import * as planner from "./planner";
import { db } from "@/db";
import { chapter, section, reviewCard, correctionGuide, refileItem, queueOrder } from "@/db/schema";
import type { QueueItem } from "@/core/planner/buildDailyQueue";

// S5 · PlannerService — Postgres réel (pattern guide.test.ts), pas de LLM.

const client = postgres(process.env.DATABASE_URL!);
const createdUserIds: string[] = [];

async function createUser() {
  const [user] = await client`insert into "user" (name, email) values ('Test', gen_random_uuid()::text || '@example.com') returning id`;
  createdUserIds.push(user.id);
  return user.id as string;
}

let userId: string;
let subjectId: string;
let chapterId: string;

beforeEach(async () => {
  userId = await createUser();
  const s = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
  subjectId = s.id;
  const [c] = await db
    .insert(chapter)
    .values({ subjectId, titre: "Chap 1", markdown: "# x", contentHash: "h" })
    .returning();
  chapterId = c.id;
});

afterAll(async () => {
  // Dates explicitement écrites dans queue_order par ce fichier (reorder + purge
  // de l'ordre manuel) — table mono-utilisateur sans owner, scopée par date plutôt
  // que par un `delete from` sans condition (corrompait des tests d'autres fichiers
  // tournant en parallèle sur la même Postgres réelle, incident constaté).
  await client`delete from queue_order where date in ('2026-07-08', '2026-07-10', '2026-07-12')`;
  for (const id of createdUserIds) {
    // ponytail: refile_item/deferral_log sont mono-utilisateur (pas de user_id) —
    // un `delete from` sans condition wipe aussi les lignes d'AUTRES fichiers de
    // test tournant en parallèle sur la même Postgres réelle (incident constaté :
    // corrompait le canary session.canary.test.ts). Scopé ici via les sections de
    // CET utilisateur de test, même patron que les autres tables ci-dessous.
    await client`delete from refile_item where item_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from deferral_log where item_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from review_card where section_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from correction_guide where section_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id}))`;
    await client`delete from chapter where subject_id in (select id from subject where user_id = ${id})`;
    await client`delete from subject where user_id = ${id}`;
    await client`delete from "user" where id = ${id}`;
  }
  await client.end();
});

async function insertSection(statut: string, opts: Partial<{ importance: number; ordre: number }> = {}) {
  const [sec] = await db
    .insert(section)
    .values({
      chapterId,
      chapterVersion: 1,
      titre: "Sec",
      ordre: opts.ordre ?? 1,
      niveauSource: 1,
      contenu: "...",
      importance: opts.importance ?? 3,
      statut: statut as never,
    })
    .returning();
  return sec;
}

async function insertReviewCard(sectionId: string, due: string, gelee = false) {
  const [card] = await db
    .insert(reviewCard)
    .values({ sectionId, due, stability: 1, difficulty: 5, reps: 1, lapses: 0, gelee })
    .returning();
  return card;
}

const TODAY = "2026-07-09";

describe("planner · S5 todayQueue", () => {
  it("file vide sans données", async () => {
    expect(await planner.todayQueue(userId, TODAY)).toEqual([]);
  });

  it("section prête ⇒ nouvelle_etude", async () => {
    await insertSection("prete");
    const queue = await planner.todayQueue(userId, TODAY);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ kind: "nouvelle_etude" });
  });

  it("ReviewCard due et non gelée ⇒ revision ; gelée ⇒ absente", async () => {
    const s1 = await insertSection("en_revision");
    const s2 = await insertSection("en_revision");
    await insertReviewCard(s1.id, TODAY, false);
    await insertReviewCard(s2.id, TODAY, true);

    const queue = await planner.todayQueue(userId, TODAY);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ kind: "revision", sectionId: s1.id });
  });

  it("defer(etude) retire l'item de la file du jour même", async () => {
    const s = await insertSection("prete");
    const date = "2026-07-10"; // refile_item/deferral_log/queue_order sont mono-utilisateur
    // (pas de user_id, ADR 6) : une date dédiée par test évite toute
    // interférence entre tests via ces tables globales.
    await planner.defer("etude", s.id, date);
    expect(await planner.todayQueue(userId, date)).toEqual([]);
  });

  it("defer(etude) : le slot du jour est perdu, jamais remplacé par la candidate suivante du vivier (USER_FLOW É2.0)", async () => {
    const a = await insertSection("prete", { ordre: 1 });
    const b = await insertSection("prete", { ordre: 2 });
    const c = await insertSection("prete", { ordre: 3 });
    await insertSection("prete", { ordre: 4 }); // 4e candidate : ne doit jamais apparaître
    const date = "2026-07-13"; // date dédiée, cf. commentaire ci-dessus

    const before = await planner.todayQueue(userId, date);
    expect(before.map((i) => (i as Extract<QueueItem, { kind: "nouvelle_etude" }>).sectionId)).toEqual([
      a.id,
      b.id,
      c.id,
    ]);

    await planner.defer("etude", a.id, date);
    const after = await planner.todayQueue(userId, date);
    expect(after.map((i) => (i as Extract<QueueItem, { kind: "nouvelle_etude" }>).sectionId)).toEqual([b.id, c.id]);
  });

  it("refile ⇒ item re_file en fin de file", async () => {
    const s = await insertSection("prete");
    const date = "2026-07-11";
    await planner.refile("etude", s.id, date);
    const queue = await planner.todayQueue(userId, date);
    expect(queue.at(-1)).toMatchObject({ kind: "re_file", itemType: "etude", itemId: s.id });
  });

  it("reorder : la permutation stockée prime, les items nouveaux s'ajoutent à la fin", async () => {
    const date = "2026-07-12";
    const a = await insertSection("prete", { ordre: 1 });
    const b = await insertSection("prete", { ordre: 2 });
    // plafond par défaut (3) laisse passer les deux ; ordre naturel = a puis b (ordreCurriculum croissant)
    const natural = await planner.todayQueue(userId, date);
    expect(natural.map((i) => (i as Extract<QueueItem, { kind: "nouvelle_etude" }>).sectionId)).toEqual([a.id, b.id]);

    await planner.reorder([`nouvelle_etude:${b.id}`, `nouvelle_etude:${a.id}`], date);
    const reordered = await planner.todayQueue(userId, date);
    expect(reordered.map((i) => (i as Extract<QueueItem, { kind: "nouvelle_etude" }>).sectionId)).toEqual([b.id, a.id]);
  });
});

describe("planner · S5 advanceFromBacklog / nextBacklogCandidate", () => {
  it("nextBacklogCandidate renvoie la 1ère candidate par priorité (importance DESC, ordre curriculum) ; null si aucune", async () => {
    expect(await planner.nextBacklogCandidate(userId, "2026-07-14")).toBeNull();

    await insertSection("prete", { ordre: 1, importance: 3 });
    const higher = await insertSection("prete", { ordre: 2, importance: 5 });
    const top = await planner.nextBacklogCandidate(userId, "2026-07-14");
    // l'importance 5 passe devant malgré un ordre curriculum plus tardif
    expect(top).toEqual({ sectionId: higher.id, titre: "Sec" });
  });

  it("advanceFromBacklog consomme un slot de DEMAIN, jamais aujourd'hui", async () => {
    const date = "2026-07-16";
    const tomorrow = "2026-07-17";
    const a = await insertSection("prete", { ordre: 1 });
    const b = await insertSection("prete", { ordre: 2 });

    await planner.advanceFromBacklog(a.id, date);

    // aujourd'hui : la dette ne le concerne pas, plafond et vivier intacts
    const today = await planner.todayQueue(userId, date);
    expect(today.map((i) => (i as Extract<QueueItem, { kind: "nouvelle_etude" }>).sectionId)).toEqual([a.id, b.id]);

    // demain : le plafond par défaut (3) perd 1 slot pour la dette d'avance ; a
    // (déjà "avancée") est exclue du vivier de demain même si son statut n'a
    // pas encore changé (pas de vraie étude simulée dans ce test unitaire).
    const c = await insertSection("prete", { ordre: 3 });
    await insertSection("prete", { ordre: 4 }); // 4e candidate : au-delà du plafond réduit (2), ne doit pas apparaître
    const tomorrowQueue = await planner.todayQueue(userId, tomorrow);
    expect(tomorrowQueue.map((i) => (i as Extract<QueueItem, { kind: "nouvelle_etude" }>).sectionId)).toEqual([
      b.id,
      c.id,
    ]);
  });
});

describe("planner · S5 horizon", () => {
  it("délègue à P8 sur les ReviewCards actives (gelées exclues)", async () => {
    const s1 = await insertSection("en_revision");
    const s2 = await insertSection("en_revision");
    await insertReviewCard(s1.id, TODAY, false);
    await insertReviewCard(s2.id, TODAY, true);

    const h = await planner.horizon(userId, TODAY);
    expect(h.chargeJ7).toBe(1);
  });
});

describe("planner · S5 nextDeadline", () => {
  it("renvoie la due la plus proche parmi les ReviewCards actives (gelées exclues) ; null si aucune (USER_FLOW É2.0)", async () => {
    expect(await planner.nextDeadline(userId)).toBeNull();

    const s1 = await insertSection("en_revision");
    const s2 = await insertSection("en_revision");
    const s3 = await insertSection("en_revision");
    await insertReviewCard(s1.id, "2026-07-15", false);
    await insertReviewCard(s2.id, "2026-07-12", true); // gelée : exclue
    await insertReviewCard(s3.id, "2026-07-20", false);

    expect(await planner.nextDeadline(userId)).toBe("2026-07-15");
  });
});

describe("planner · S5 attentionBadges", () => {
  it("rubriques à valider comptées", async () => {
    await insertSection("rubrique_a_valider");
    const badges = await planner.attentionBadges(userId, TODAY);
    expect(badges).toContainEqual({ type: "rubriques_a_valider", count: 1 });
  });

  it("chapitre sans aucune section triée ⇒ chapitres_non_tries", async () => {
    const badges = await planner.attentionBadges(userId, TODAY);
    expect(badges).toContainEqual({ type: "chapitres_non_tries", count: 1 });
  });

  it("chapitre avec au moins une section triée ⇒ absent du badge", async () => {
    await insertSection("active");
    const badges = await planner.attentionBadges(userId, TODAY);
    expect(badges.find((b) => b.type === "chapitres_non_tries")).toBeUndefined();
  });

  it("chapitre mixte (sections déjà triées + une a_trier apparue par ré-import) ⇒ chapitres_non_tries", async () => {
    await insertSection("active", { ordre: 1 });
    await insertSection("prete", { ordre: 2 });
    await insertSection("a_trier", { ordre: 3 });
    const badges = await planner.attentionBadges(userId, TODAY);
    expect(badges).toContainEqual({ type: "chapitres_non_tries", count: 1 });
  });

  it("matière dont l'examen date de plus de 7 jours ⇒ archivage_suggere", async () => {
    await account.updateSubject(userId, subjectId, { dateExamen: "2026-06-20" });
    const badges = await planner.attentionBadges(userId, TODAY);
    expect(badges).toContainEqual({ type: "archivage_suggere", count: 1 });
  });

  it("aucun signal ⇒ tableau vide", async () => {
    const badges = await planner.attentionBadges(await createUser(), TODAY);
    expect(badges).toEqual([]);
  });

  it("rubrique obsolète par cascade (chapterVersion en retard) ⇒ cours_modifie", async () => {
    const sec = await insertSection("prete");
    await db.update(section).set({ chapterVersion: 2 }).where(eq(section.id, sec.id));
    await db.insert(correctionGuide).values({ sectionId: sec.id, chapterVersion: 1, contenu: {}, statut: "obsolete" });
    const badges = await planner.attentionBadges(userId, TODAY);
    expect(badges).toContainEqual({ type: "cours_modifie", count: 1 });
  });

  it("rubrique obsolète par regenerate manuel (même chapterVersion) ⇒ absent du badge", async () => {
    const sec = await insertSection("prete");
    await db.insert(correctionGuide).values({ sectionId: sec.id, chapterVersion: 1, contenu: {}, statut: "obsolete" });
    const badges = await planner.attentionBadges(userId, TODAY);
    expect(badges.find((b) => b.type === "cours_modifie")).toBeUndefined();
  });
});

describe("planner · S5 purgeExpired", () => {
  it("supprime les RefileItem et QueueOrder antérieurs à la date, garde ceux du jour et du futur", async () => {
    const sec = await insertSection("prete");

    await db.insert(refileItem).values([
      { date: "2026-07-08", itemType: "etude", itemId: sec.id },
      { date: TODAY, itemType: "etude", itemId: sec.id },
    ]);
    await db.insert(queueOrder).values([
      { date: "2026-07-08", order: ["a"] },
      { date: "2026-07-10", order: ["b"] },
    ]);

    await planner.purgeExpired(TODAY);

    const refileRows = await db.query.refileItem.findMany({ where: (r, { eq: eqOp }) => eqOp(r.itemId, sec.id) });
    expect(refileRows.map((r) => r.date)).toEqual([TODAY]);

    const orderRows = await db.query.queueOrder.findMany({ where: (o, { inArray }) => inArray(o.date, ["2026-07-08", "2026-07-10"]) });
    expect(orderRows.map((r) => r.date)).toEqual(["2026-07-10"]);
  });
});
