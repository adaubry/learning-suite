import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { deferralLog, refileItem, reviewCard, section, chapter, plannerConfig, serieGel } from "@/db/schema";
import * as account from "./account";
import * as stats from "./stats";

// S11 · StatsService — Postgres réel (pattern review.test.ts).

const client = postgres(process.env.DATABASE_URL!);
const createdUserIds: string[] = [];
let itemIds: string[] = [];
let gelDates: string[] = [];

async function createUser() {
  const [user] = await client`insert into auth.users (id) values (gen_random_uuid()) returning id`;
  createdUserIds.push(user.id);
  return user.id as string;
}

let userId: string;
let chapterId: string;

beforeEach(async () => {
  userId = await createUser();
  const s = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
  const [c] = await db
    .insert(chapter)
    .values({ subjectId: s.id, titre: "Chap 1", markdown: "# x", contentHash: "h" })
    .returning();
  chapterId = c.id;
});

afterEach(async () => {
  if (itemIds.length > 0) {
    await client`delete from deferral_log where item_id = ANY(${itemIds})`;
    await client`delete from refile_item where item_id = ANY(${itemIds})`;
  }
  itemIds = [];
  if (gelDates.length > 0) {
    await client`delete from serie_gel where date = ANY(${gelDates})`;
  }
  gelDates = [];
});

afterAll(async () => {
  for (const id of createdUserIds) {
    await client`delete from review_card where section_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id}))`;
    await client`delete from chapter where subject_id in (select id from subject where user_id = ${id})`;
    await client`delete from subject where user_id = ${id}`;
    await client`delete from planner_config where user_id = ${id}`;
    await client`delete from auth.users where id = ${id}`;
  }
  await client.end();
});

async function createSection(importance = 3) {
  const [sec] = await db
    .insert(section)
    .values({ chapterId, chapterVersion: 1, titre: "Sec", ordre: 1, niveauSource: 1, contenu: "...", importance, statut: "en_revision" })
    .returning();
  return sec;
}

describe("stats · S11 · detteReports", () => {
  it("compte un item reporté (avance=false) encore présent dans la re-file à une date <= aujourd'hui", async () => {
    const itemId = crypto.randomUUID();
    itemIds.push(itemId);
    await db.insert(deferralLog).values({ date: "2026-07-01", itemType: "etude", itemId, avance: false });
    await db.insert(refileItem).values({ date: "2026-07-01", itemType: "etude", itemId });

    expect(await stats.detteReports("2026-07-20")).toBeGreaterThanOrEqual(1);
  });

  it("ignore une dette d'avance (avance=true), même présente dans la re-file", async () => {
    const before = await stats.detteReports("2026-07-20");
    const itemId = crypto.randomUUID();
    itemIds.push(itemId);
    await db.insert(deferralLog).values({ date: "2026-07-01", itemType: "etude", itemId, avance: true });
    await db.insert(refileItem).values({ date: "2026-07-01", itemType: "etude", itemId });

    expect(await stats.detteReports("2026-07-20")).toBe(before);
  });

  it("ignore un report qui n'est plus dans la re-file", async () => {
    const before = await stats.detteReports("2026-07-20");
    const itemId = crypto.randomUUID();
    itemIds.push(itemId);
    await db.insert(deferralLog).values({ date: "2026-07-01", itemType: "etude", itemId, avance: false });
    // pas de ligne refile_item correspondante

    expect(await stats.detteReports("2026-07-20")).toBe(before);
  });
});

describe("stats · S11 · chargeParJour", () => {
  it("compte les ReviewCards dues non gelées, en ajoutant nouvellesParJour à chaque jour", async () => {
    const sec = await createSection();
    const [card] = await db
      .insert(reviewCard)
      .values({ sectionId: sec.id, due: "2026-07-20", stability: 1, difficulty: 1, gelee: false })
      .returning();

    const charge = await stats.chargeParJour(userId, "2026-07-20");
    expect(charge["2026-07-20"]).toBe(1 + 3); // nouvellesParJour par défaut = 3
    expect(Object.keys(charge)).toContain("2026-07-19");
    expect(Object.keys(charge)).toContain("2026-08-03");

    await db.delete(reviewCard).where(eq(reviewCard.id, card.id));
  });
});

describe("stats · S11 · useStreakFreeze", () => {
  it("insère un gel et décrémente le compteur", async () => {
    await account.updatePlannerConfig(userId, 3);
    gelDates.push("2026-07-20");

    await stats.useStreakFreeze(userId, "2026-07-20");

    const gel = await db.query.serieGel.findFirst({ where: eq(serieGel.date, "2026-07-20") });
    expect(gel).toBeDefined();
    const config = await account.getPlannerConfig(userId);
    expect(config.gelsSerieRestants).toBe(1); // défaut 2 - 1
  });

  it("refuse si aucun gel restant", async () => {
    await db
      .insert(plannerConfig)
      .values({ userId, gelsSerieRestants: 0 })
      .onConflictDoUpdate({ target: plannerConfig.userId, set: { gelsSerieRestants: 0 } });

    await expect(stats.useStreakFreeze(userId, "2026-07-20")).rejects.toThrow();
  });
});
