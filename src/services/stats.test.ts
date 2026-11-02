import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { deferralLog, refileItem, reviewCard, plannerConfig, serieGel } from "@/db/schema";
import * as account from "./account";
import * as stats from "./stats";
import { client, cleanupAll, seedSet } from "@/test/fixtures";

// StatsService — Postgres réel.

let itemIds: string[] = [];
let gelDates: string[] = [];
let userId: string;
let ficheId: string;

beforeEach(async () => {
  const s = await seedSet();
  userId = s.userId;
  ficheId = s.fiches[0].id;
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

afterAll(cleanupAll);

describe("stats · detteReports", () => {
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

describe("stats · chargeParJour", () => {
  it("compte les ReviewCards dues non gelées, plus le plafond de nouvelles fiches s'il y en a un", async () => {
    await client`update fiche set statut = 'en_revision' where id = ${ficheId}`;
    const [card] = await db
      .insert(reviewCard)
      .values({ ficheId, due: "2026-07-20", stability: 1, difficulty: 1, gelee: false })
      .returning();

    expect((await stats.chargeParJour(userId, "2026-07-20"))["2026-07-20"]).toBe(1); // sans plafond : révisions seules
    await account.updatePlannerConfig(userId, 3);
    const charge = await stats.chargeParJour(userId, "2026-07-20");
    expect(charge["2026-07-20"]).toBe(1 + 3);
    expect(Object.keys(charge)).toContain("2026-07-19");
    expect(Object.keys(charge)).toContain("2026-08-03");

    await db.delete(reviewCard).where(eq(reviewCard.id, card.id));
  });
});

describe("stats · useStreakFreeze", () => {
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

describe("stats · sessions par jour et série", () => {
  it("compte les tentatives de l'utilisateur par jour, et en déduit la série", async () => {
    const [cycle] = await client`insert into study_cycle (user_id, fiche_id, type, etat, closed_at) values (${userId}, ${ficheId}, 'etude', 'clos', now()) returning id`;
    await client`insert into tentative (cycle_id, fiche_id, fiche_hash, numero, input, created_at) values
      (${cycle.id}, ${ficheId}, 'h', 1, 'a', '2026-07-19T10:00:00Z'), (${cycle.id}, ${ficheId}, 'h', 2, 'b', '2026-07-20T10:00:00Z')`;

    expect(await stats.sessionCountsByDay(userId, "2026-07-19", "2026-07-20")).toEqual({ "2026-07-19": 1, "2026-07-20": 1 });
    expect((await stats.streak(userId, "2026-07-20")).streak).toBe(2);
  });
});
