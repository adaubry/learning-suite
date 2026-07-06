import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { errorEntry } from "@/db/schema";

// S7 · ErrorService — partiel (FUNCTIONS §3, §7) : seule `activeFor` existe, requise
// par le ContextBuilder de L2 (« seules les erreurs actives alimentent les LLM »).
// commitCandidates/list/resolve/edit/delete viendront avec le cycle d'étude (Phase 5).

const MAX_ERREURS_ACTIVES_CONTEXTE = 20; // ponytail: plafond arbitraire, à ajuster si le contexte LLM déborde

export async function activeFor(subjectId: string) {
  return db.query.errorEntry.findMany({
    where: and(eq(errorEntry.subjectId, subjectId), eq(errorEntry.statut, "active")),
    limit: MAX_ERREURS_ACTIVES_CONTEXTE,
  });
}
