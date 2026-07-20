import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { alert as alertTable, deadline as deadlineTable } from "@/db/schema";
import * as deadlineService from "./deadline";

// S10 · DeadlineService — Postgres réel (pattern review.test.ts), pas de LLM ;
// mono-utilisateur (deadline/alert n'ont pas de userId), aucun compte à créer.

let createdIds: string[] = [];

afterEach(async () => {
  if (createdIds.length > 0) {
    await db.delete(alertTable).where(inArray(alertTable.deadlineId, createdIds));
    await db.delete(deadlineTable).where(inArray(deadlineTable.id, createdIds));
  }
  createdIds = [];
});

describe("deadline · S10", () => {
  it("create : une échéance simple, ackAt null", async () => {
    const [row] = await deadlineService.create({
      subjectId: undefined,
      type: "examen",
      libelle: "Écrit 3h",
      dueDate: "2026-12-01",
      occurrences: 1,
    });
    createdIds.push(row.id);
    expect(row).toMatchObject({ type: "examen", libelle: "Écrit 3h", dueDate: "2026-12-01", ackAt: null });
    expect(row.recurrenceGroupId).toBeNull();
  });

  it("create : récurrence hebdomadaire déplie n occurrences espacées de 7 jours, groupées", async () => {
    const rows = await deadlineService.create({
      subjectId: undefined,
      type: "controle_continu",
      libelle: "CC TD",
      dueDate: "2026-09-07",
      occurrences: 3,
    });
    createdIds.push(...rows.map((r) => r.id));
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.dueDate)).toEqual(["2026-09-07", "2026-09-14", "2026-09-21"]);
    const groupId = rows[0].recurrenceGroupId;
    expect(groupId).not.toBeNull();
    expect(rows.every((r) => r.recurrenceGroupId === groupId)).toBe(true);
  });

  it("list : seulement ackAt IS NULL, triées par dueDate", async () => {
    const [a] = await deadlineService.create({ type: "autre", libelle: "B", dueDate: "2026-12-10", occurrences: 1 });
    const [b] = await deadlineService.create({ type: "autre", libelle: "A", dueDate: "2026-12-05", occurrences: 1 });
    createdIds.push(a.id, b.id);
    await deadlineService.ack(a.id);

    const visible = await deadlineService.list();
    const ids = visible.map((d) => d.id);
    expect(ids).toContain(b.id);
    expect(ids).not.toContain(a.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id) === -1 ? Infinity : ids.indexOf(a.id));
  });

  it("update : patch partiel des champs", async () => {
    const [row] = await deadlineService.create({ type: "autre", libelle: "X", dueDate: "2026-12-01", occurrences: 1 });
    createdIds.push(row.id);
    const updated = await deadlineService.update({ id: row.id, libelle: "X corrigé", coefficient: 2 });
    expect(updated).toMatchObject({ libelle: "X corrigé", coefficient: 2, dueDate: "2026-12-01" });
  });

  it("ack : dismisse en cascade les alertes visibles de la deadline ; unack restaure celles du jour", async () => {
    const [row] = await deadlineService.create({ type: "examen", libelle: "E", dueDate: "2026-12-03", occurrences: 1 });
    createdIds.push(row.id);
    const today = new Date().toISOString().slice(0, 10);
    const [a] = await db
      .insert(alertTable)
      .values({ type: "echeance_j3", deadlineId: row.id, dateRef: today, payload: {} })
      .returning();

    await deadlineService.ack(row.id);
    let reloaded = await db.query.alert.findFirst({ where: eq(alertTable.id, a.id) });
    expect(reloaded?.dismissedAt).not.toBeNull();

    await deadlineService.unack(row.id);
    reloaded = await db.query.alert.findFirst({ where: eq(alertTable.id, a.id) });
    expect(reloaded?.dismissedAt).toBeNull();
    const deadlineReloaded = await db.query.deadline.findFirst({ where: eq(deadlineTable.id, row.id) });
    expect(deadlineReloaded?.ackAt).toBeNull();
  });

  it("remove scope 'this' : ne supprime que l'occurrence visée", async () => {
    const rows = await deadlineService.create({ type: "controle_continu", libelle: "CC", dueDate: "2026-09-07", occurrences: 3 });
    createdIds.push(...rows.map((r) => r.id));

    await deadlineService.remove(rows[1].id, "this");

    const remaining = await db.query.deadline.findMany({ where: inArray(deadlineTable.id, rows.map((r) => r.id)) });
    expect(remaining.map((r) => r.id).sort()).toEqual([rows[0].id, rows[2].id].sort());
  });

  it("remove scope 'following' : supprime l'occurrence visée et toutes celles après elle", async () => {
    const rows = await deadlineService.create({ type: "controle_continu", libelle: "CC", dueDate: "2026-09-07", occurrences: 4 });
    createdIds.push(...rows.map((r) => r.id));

    await deadlineService.remove(rows[1].id, "following");

    const remaining = await db.query.deadline.findMany({ where: inArray(deadlineTable.id, rows.map((r) => r.id)) });
    expect(remaining.map((r) => r.id)).toEqual([rows[0].id]);
  });
});
