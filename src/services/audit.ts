import { db } from "@/db";
import { auditEvent } from "@/db/schema";

// S8 · AuditService (FUNCTIONS §3, §7) — LA définition unique de « journalisé ».
// Partiel : seul logEvent existe (les vues de consultation viendront avec les
// écrans qui en ont besoin).

type AuditEventType =
  | "override_verdict"
  | "revelation_correction"
  | "report"
  | "acquittement_anomalie"
  | "validation_sur_insuffisant";

export async function logEvent(type: AuditEventType, entiteType: string, entiteId: string) {
  await db.insert(auditEvent).values({ type, entiteType, entiteId });
}
