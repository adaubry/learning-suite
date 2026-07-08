import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { errorEntry } from "@/db/schema";

// S7 · ErrorService — partiel (FUNCTIONS §3, §7) : `activeFor`/`activeForSection`,
// requises par les ContextBuilders L2/L3 (« seules les erreurs actives alimentent
// les LLM »). commitCandidates/list/resolve/edit/delete viennent avec Bloc 5.3.

const MAX_ERREURS_ACTIVES_CONTEXTE = 20; // ponytail: plafond arbitraire, à ajuster si le contexte LLM déborde

// L2 (rubrique) : erreurs actives de la MATIÈRE entière (orientent les pièges).
export async function activeFor(subjectId: string) {
  return db.query.errorEntry.findMany({
    where: and(eq(errorEntry.subjectId, subjectId), eq(errorEntry.statut, "active")),
    limit: MAX_ERREURS_ACTIVES_CONTEXTE,
  });
}

// L3 (correction) : erreurs actives de la SECTION uniquement (ARCHITECTURE §9
// ligne 3+4 — détection de récidive, périmètre plus étroit que L2).
export async function activeForSection(sectionId: string) {
  return db.query.errorEntry.findMany({
    where: and(eq(errorEntry.sectionId, sectionId), eq(errorEntry.statut, "active")),
    limit: MAX_ERREURS_ACTIVES_CONTEXTE,
  });
}
