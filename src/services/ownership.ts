import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fiche, ficheSet, subject } from "@/db/schema";

// Contrôles d'appartenance partagés (fiche → set → matière → utilisateur). Module
// à part : review et fiche en ont besoin l'un et l'autre, sans s'importer.

export class FicheIntrouvableError extends Error {
  constructor() {
    super("Fiche introuvable.");
  }
}

export async function loadOwnedSubject(subjectId: string, userId: string) {
  const subj = await db.query.subject.findFirst({ where: eq(subject.id, subjectId) });
  if (!subj || subj.userId !== userId) throw new Error("Matière introuvable.");
  return subj;
}

export async function loadOwnedSet(setId: string, userId: string) {
  const set = await db.query.ficheSet.findFirst({ where: eq(ficheSet.id, setId) });
  if (!set) throw new Error("Set de fiches introuvable.");
  const subj = await loadOwnedSubject(set.subjectId, userId);
  return { set, subject: subj };
}

export async function loadOwnedFiche(ficheId: string, userId: string) {
  const [row] = await db
    .select({ fiche, set: ficheSet, subject })
    .from(fiche)
    .innerJoin(ficheSet, eq(fiche.setId, ficheSet.id))
    .innerJoin(subject, eq(ficheSet.subjectId, subject.id))
    .where(eq(fiche.id, ficheId));
  if (!row || row.subject.userId !== userId) throw new FicheIntrouvableError();
  return row;
}
