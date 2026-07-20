import { and, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/db";
import { deadline } from "@/db/schema";
import { addDays } from "@/lib/utils";
import * as alertService from "./alert";
import type { DeadlineInput, DeadlineUpdateInput } from "./deadline.schemas";

// S10 · DeadlineService (IMPLEMENT_SCHEDULE.md §3, §7) — mono-utilisateur (ADR 6),
// pas de userId sur `deadline` (même doctrine que DeferralLog/RefileItem).
// Possède le CRUD + l'ack/unack ; le dépliage de récurrence (une ligne par
// occurrence, `recurrenceGroupId` partagé) se fait ici, à la création.

// Non acquittées, triées par échéance — seule vue consommée par la checklist
// (U27) ET par le moteur d'alertes (§5 : « deadlines : uniquement ackAt IS NULL »),
// une seule requête pour les deux appelants.
export async function list() {
  return db.query.deadline.findMany({
    where: isNull(deadline.ackAt),
    orderBy: (d, { asc }) => [asc(d.dueDate)],
  });
}

export async function create(input: DeadlineInput) {
  const base = {
    subjectId: input.subjectId ?? null,
    type: input.type,
    libelle: input.libelle,
    coefficient: input.coefficient ?? null,
    dureeMin: input.dureeMin ?? null,
  };

  if (input.occurrences <= 1) {
    return db.insert(deadline).values({ ...base, dueDate: input.dueDate }).returning();
  }

  const recurrenceGroupId = crypto.randomUUID();
  const rows = Array.from({ length: input.occurrences }, (_, i) => ({
    ...base,
    dueDate: addDays(input.dueDate, i * 7),
    recurrenceGroupId,
  }));
  return db.insert(deadline).values(rows).returning();
}

export async function update(input: DeadlineUpdateInput) {
  const { id, ...rest } = input;
  const patch: Partial<typeof deadline.$inferInsert> = {};
  if (rest.subjectId !== undefined) patch.subjectId = rest.subjectId ?? null;
  if (rest.type !== undefined) patch.type = rest.type;
  if (rest.libelle !== undefined) patch.libelle = rest.libelle;
  if (rest.dueDate !== undefined) patch.dueDate = rest.dueDate;
  if (rest.coefficient !== undefined) patch.coefficient = rest.coefficient ?? null;
  if (rest.dureeMin !== undefined) patch.dureeMin = rest.dureeMin ?? null;

  const [row] = await db.update(deadline).set(patch).where(eq(deadline.id, id)).returning();
  return row;
}

// Cocher (§8 critère 1) : retire la deadline de la liste ET dismisse en cascade
// toutes ses alertes visibles — un seul point d'entrée pour les deux écritures
// (AGENTS §2.2, la Server Action n'appelle qu'UN service).
export async function ack(id: string) {
  const [updated] = await db.update(deadline).set({ ackAt: new Date() }).where(eq(deadline.id, id)).returning();
  if (updated) await alertService.dismissForDeadline(id);
  return updated;
}

// Undo (toast 5 s, §8 critère 1) : restaure la deadline ET les alertes que
// `ack` vient de dismisser aujourd'hui même — pas l'historique de dismissals
// plus anciens, légitimement clos.
export async function unack(id: string) {
  const [updated] = await db.update(deadline).set({ ackAt: null }).where(eq(deadline.id, id)).returning();
  if (updated) await alertService.restoreTodayDismissedForDeadline(id);
  return updated;
}

// `scope` (§7) : une occurrence récurrente propose « celle-ci / toutes les
// suivantes » via `recurrenceGroupId` (occurrences à venir, dueDate >= celle-ci).
export async function remove(id: string, scope: "this" | "following" = "this") {
  if (scope === "following") {
    const row = await db.query.deadline.findFirst({ where: eq(deadline.id, id) });
    if (row?.recurrenceGroupId) {
      await db
        .delete(deadline)
        .where(and(eq(deadline.recurrenceGroupId, row.recurrenceGroupId), gte(deadline.dueDate, row.dueDate)));
      return;
    }
  }
  await db.delete(deadline).where(eq(deadline.id, id));
}
