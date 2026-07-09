import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditEvent } from "@/db/schema";

// S8 · AuditService (FUNCTIONS §3, §7) — LA définition unique de « journalisé ».
// Bloc 5.3 ajoute la lecture (`forEntity`), consommée par la vue session
// lecture seule (badge « override », FUNCTIONS §3 S8).

type AuditEventType =
  | "override_verdict"
  | "revelation_correction"
  | "report"
  | "acquittement_anomalie"
  | "validation_sur_insuffisant";

export async function logEvent(type: AuditEventType, entiteType: string, entiteId: string) {
  await db.insert(auditEvent).values({ type, entiteType, entiteId });
}

export async function forEntity(entiteType: string, entiteId: string) {
  return db.query.auditEvent.findMany({
    where: and(eq(auditEvent.entiteType, entiteType), eq(auditEvent.entiteId, entiteId)),
    orderBy: (e, { desc }) => [desc(e.createdAt)],
  });
}
