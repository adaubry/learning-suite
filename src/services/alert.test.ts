import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { alert as alertTable, deadline as deadlineTable } from "@/db/schema";
import * as deadlineService from "./deadline";
import * as alertService from "./alert";

// S12 · AlertService — Postgres réel (pattern review.test.ts).

const client = postgres(process.env.DATABASE_URL!);
const createdUserIds: string[] = [];
let deadlineIds: string[] = [];

async function createUser() {
  const [user] = await client`insert into "user" (name, email) values ('Test', gen_random_uuid()::text || '@example.com') returning id`;
  createdUserIds.push(user.id);
  return user.id as string;
}

let userId: string;

beforeEach(async () => {
  userId = await createUser();
});

afterEach(async () => {
  if (deadlineIds.length > 0) {
    await db.delete(alertTable).where(inArray(alertTable.deadlineId, deadlineIds));
    await db.delete(deadlineTable).where(inArray(deadlineTable.id, deadlineIds));
  }
  deadlineIds = [];
});

afterAll(async () => {
  for (const id of createdUserIds) {
    await client`delete from planner_config where user_id = ${id}`;
    await client`delete from "user" where id = ${id}`;
  }
  await client.end();
});

const today = "2026-07-20";

describe("alert · S12 · generateAlerts", () => {
  it("génère echeance_j3 pour un examen coef>=2 à J-3, jamais deux fois (idempotence, index alert_dedupe)", async () => {
    const [d] = await deadlineService.create({
      subjectId: undefined,
      type: "examen",
      libelle: "Écrit 3h",
      dueDate: "2026-07-23",
      coefficient: 2,
      occurrences: 1,
    });
    deadlineIds.push(d.id);

    await alertService.generateAlerts(userId, today);
    await alertService.generateAlerts(userId, today);

    const rows = await db.query.alert.findMany({ where: eq(alertTable.deadlineId, d.id) });
    expect(rows.filter((r) => r.type === "echeance_j3")).toHaveLength(1);
  });
});

describe("alert · S12 · cycle de vie", () => {
  it("listVisible exclut dismissée et snoozée dans le futur, inclut snoozée passée", async () => {
    const [d] = await deadlineService.create({ type: "autre", libelle: "X", dueDate: "2026-07-25", occurrences: 1 });
    deadlineIds.push(d.id);

    const [dismissed] = await db
      .insert(alertTable)
      .values({ type: "echeance_j7", deadlineId: d.id, dateRef: today, payload: {} })
      .returning();
    await alertService.dismiss(dismissed.id);

    const [snoozedFuture] = await db
      .insert(alertTable)
      .values({ type: "echeance_j3", deadlineId: d.id, dateRef: today, snoozedUntil: "2099-01-01", payload: {} })
      .returning();

    const [snoozedPast] = await db
      .insert(alertTable)
      .values({ type: "echeance_j1", deadlineId: d.id, dateRef: today, snoozedUntil: "2020-01-01", payload: {} })
      .returning();

    const visible = await alertService.listVisible(today);
    const ids = visible.map((a) => a.id);
    expect(ids).not.toContain(dismissed.id);
    expect(ids).not.toContain(snoozedFuture.id);
    expect(ids).toContain(snoozedPast.id);
  });

  it("snooze refuse jour_j et depassee, accepte les autres", async () => {
    const [d] = await deadlineService.create({ type: "autre", libelle: "X", dueDate: "2026-07-25", occurrences: 1 });
    deadlineIds.push(d.id);

    const [jourJ] = await db
      .insert(alertTable)
      .values({ type: "echeance_jour_j", deadlineId: d.id, dateRef: today, payload: {} })
      .returning();
    await expect(alertService.snooze(jourJ.id, "2026-07-21")).rejects.toThrow();

    const [depassee] = await db
      .insert(alertTable)
      .values({ type: "echeance_depassee", deadlineId: d.id, dateRef: today, payload: {} })
      .returning();
    await expect(alertService.snooze(depassee.id, "2026-07-21")).rejects.toThrow();

    const [j7] = await db
      .insert(alertTable)
      .values({ type: "echeance_j7", deadlineId: d.id, dateRef: today, payload: {} })
      .returning();
    await alertService.snooze(j7.id, "2026-07-21");
    const reloaded = await db.query.alert.findFirst({ where: eq(alertTable.id, j7.id) });
    expect(reloaded?.snoozedUntil).toBe("2026-07-21");
  });
});
