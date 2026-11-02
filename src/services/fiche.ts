import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import {
  deferralLog,
  errorEntry,
  fiche,
  ficheSet,
  refileItem,
  reviewCard,
  studyCycle,
  subject,
  tentative,
} from "@/db/schema";
import { parseFicheSet, type ParsedFiche } from "@/core/fiche/parseFicheSet";
import { extractPoints } from "@/core/fiche/extractPoints";
import { matchFiches, type StatutAppariement } from "@/core/fiche/matchFiches";
import { loadOwnedFiche, loadOwnedSet, loadOwnedSubject } from "./ownership";
import * as reviewService from "./review";

// FicheService (ARCHITECTURE.md v2 §5) : import et ré-import de sets de fiches,
// archivage, suppression, lecture. Le ré-import conserve l'historique FSRS des
// fiches appariées (matchFiches) : c'est l'invariant de ce service.

export class AucuneFicheError extends Error {
  constructor() {
    super("Aucune fiche détectée : chaque fiche doit commencer par un titre 2 (« ## 1. Titre »).");
  }
}

export interface ApercuFiche {
  numero: number;
  titre: string;
  nbPoints: number;
  avertissements: string[];
  /** Ré-import seulement. */
  statut?: StatutAppariement;
}

export interface ApercuImport {
  fiches: ApercuFiche[];
  retirees: { numero: number; titre: string }[];
  avertissements: string[];
}

function avertissementsFiche(f: ParsedFiche): { nbPoints: number; avertissements: string[] } {
  const points = extractPoints(f.contenu);
  const avertissements: string[] = [];
  if (points.length === 0) avertissements.push("Aucun point à corriger.");
  else if (points[0].etiquette !== "Thèse") avertissements.push("Pas de thèse en première ligne.");
  return { nbPoints: points.length, avertissements };
}

function parseOrThrow(markdown: string) {
  const parsed = parseFicheSet(markdown);
  if (parsed.fiches.length === 0) throw new AucuneFicheError();
  return parsed;
}

async function existingFiches(setId: string) {
  return db.query.fiche.findMany({ where: eq(fiche.setId, setId), orderBy: [asc(fiche.numero)] });
}

// Aperçu sans écriture : ce que l'import (ou le ré-import de `setId`) ferait.
export async function previewImport(userId: string, markdown: string, setId?: string): Promise<ApercuImport> {
  const parsed = parseOrThrow(markdown);
  const apercu = parsed.fiches.map((f) => ({ numero: f.numero, titre: f.titre, ...avertissementsFiche(f) }));
  if (!setId) return { fiches: apercu, retirees: [], avertissements: parsed.avertissements };

  await loadOwnedSet(setId, userId);
  const existantes = await existingFiches(setId);
  const { appariements, retirees } = matchFiches(existantes, parsed.fiches);
  const parId = new Map(existantes.map((e) => [e.id, e]));
  return {
    fiches: apercu.map((a, i) => ({ ...a, statut: appariements[i].statut })),
    retirees: retirees
      .map((id) => parId.get(id)!)
      .filter((e) => e.statut !== "archivee")
      .map((e) => ({ numero: e.numero, titre: e.titre })),
    avertissements: parsed.avertissements,
  };
}

export async function importSet(userId: string, input: { subjectId: string; titre: string; markdown: string }) {
  await loadOwnedSubject(input.subjectId, userId);
  const parsed = parseOrThrow(input.markdown);

  return db.transaction(async (tx) => {
    const [set] = await tx
      .insert(ficheSet)
      .values({ subjectId: input.subjectId, titre: input.titre, markdown: input.markdown })
      .returning();
    await tx.insert(fiche).values(
      parsed.fiches.map((f) => ({
        setId: set.id,
        numero: f.numero,
        titre: f.titre,
        contenu: f.contenu,
        contentHash: f.contentHash,
      })),
    );
    return set;
  });
}

// Ré-import : fiche appariée ⇒ mise à jour en place (même id, donc même carte
// FSRS et même historique) ; nouvelle ⇒ insérée ; disparue ⇒ archivée, carte
// gelée ; réapparue ⇒ restaurée, carte dégelée.
export async function reimportSet(userId: string, setId: string, markdown: string) {
  const { set, subject: subj } = await loadOwnedSet(setId, userId);
  const parsed = parseOrThrow(markdown);
  const existantes = await existingFiches(setId);
  const { appariements, retirees } = matchFiches(existantes, parsed.fiches);
  const parId = new Map(existantes.map((e) => [e.id, e]));
  const avecCarte = new Set(
    existantes.length
      ? (
          await db.query.reviewCard.findMany({
            where: inArray(reviewCard.ficheId, existantes.map((e) => e.id)),
            columns: { ficheId: true },
          })
        ).map((c) => c.ficheId)
      : [],
  );

  const restaurees: string[] = [];
  const archiveesMaintenant = retirees.filter((id) => parId.get(id)!.statut !== "archivee");

  await db.transaction(async (tx) => {
    for (const a of appariements) {
      const entrante = parsed.fiches[a.index];
      const valeurs = {
        numero: entrante.numero,
        titre: entrante.titre,
        contenu: entrante.contenu,
        contentHash: entrante.contentHash,
      };
      if (!a.existanteId) {
        await tx.insert(fiche).values({ setId, ...valeurs });
        continue;
      }
      const avant = parId.get(a.existanteId)!;
      const restauree = avant.statut === "archivee";
      if (restauree) restaurees.push(avant.id);
      if (a.statut === "inchangee" && !restauree) continue;
      await tx
        .update(fiche)
        .set({
          ...valeurs,
          ...(restauree ? { statut: avecCarte.has(avant.id) ? ("en_revision" as const) : ("nouvelle" as const) } : {}),
        })
        .where(eq(fiche.id, avant.id));
    }
    if (archiveesMaintenant.length) {
      await tx.update(fiche).set({ statut: "archivee" }).where(inArray(fiche.id, archiveesMaintenant));
    }
    await tx.update(ficheSet).set({ markdown, importedAt: new Date() }).where(eq(ficheSet.id, setId));
  });

  await reviewService.freeze(archiveesMaintenant);
  if (set.statut === "actif" && subj.statut === "active") await reviewService.unfreeze(restaurees);

  return { set, nouvelles: appariements.filter((a) => !a.existanteId).length, retirees: archiveesMaintenant.length };
}

async function ficheIdsActives(setIds: string[]) {
  if (setIds.length === 0) return [];
  const rows = await db.query.fiche.findMany({
    where: and(inArray(fiche.setId, setIds), inArray(fiche.statut, ["nouvelle", "en_revision"])),
    columns: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function archiveSet(userId: string, setId: string) {
  const { set } = await loadOwnedSet(setId, userId);
  if (set.statut === "archive") return;
  await db.update(ficheSet).set({ statut: "archive", archivedAt: new Date() }).where(eq(ficheSet.id, setId));
  await reviewService.freeze(await ficheIdsActives([setId]));
}

export async function unarchiveSet(userId: string, setId: string) {
  const { set, subject: subj } = await loadOwnedSet(setId, userId);
  if (set.statut === "actif") return;
  await db.update(ficheSet).set({ statut: "actif", archivedAt: null }).where(eq(ficheSet.id, setId));
  // Matière encore archivée : ses cartes restent gelées, son propre dégel s'en chargera.
  if (subj.statut === "active") await reviewService.unfreeze(await ficheIdsActives([setId]), set.archivedAt);
}

// Cartes des sets actifs d'une matière (un set archivé à part garde son propre gel).
export async function ficheIdsOfActiveSets(subjectId: string) {
  const sets = await db.query.ficheSet.findMany({
    where: and(eq(ficheSet.subjectId, subjectId), eq(ficheSet.statut, "actif")),
    columns: { id: true },
  });
  return ficheIdsActives(sets.map((s) => s.id));
}

// Suppression définitive (double confirmation côté UI) : historique compris, dans
// l'ordre des clés étrangères.
export async function deleteSet(userId: string, setId: string) {
  await loadOwnedSet(setId, userId);
  await deleteSetsUnchecked([setId]);
}

export async function deleteSetsUnchecked(setIds: string[]) {
  if (setIds.length === 0) return;
  const ficheIds = (
    await db.query.fiche.findMany({ where: inArray(fiche.setId, setIds), columns: { id: true } })
  ).map((f) => f.id);
  await db.transaction(async (tx) => {
    if (ficheIds.length) {
      await tx.delete(errorEntry).where(inArray(errorEntry.ficheId, ficheIds));
      await tx.delete(tentative).where(inArray(tentative.ficheId, ficheIds));
      await tx.delete(studyCycle).where(inArray(studyCycle.ficheId, ficheIds));
      await tx.delete(reviewCard).where(inArray(reviewCard.ficheId, ficheIds));
      await tx.delete(deferralLog).where(inArray(deferralLog.itemId, ficheIds));
      await tx.delete(refileItem).where(inArray(refileItem.itemId, ficheIds));
      await tx.delete(fiche).where(inArray(fiche.id, ficheIds));
    }
    await tx.delete(ficheSet).where(inArray(ficheSet.id, setIds));
  });
}

// --- Lecture ---

export async function listSets(userId: string) {
  return db
    .select({ set: ficheSet, subjectId: subject.id })
    .from(ficheSet)
    .innerJoin(subject, eq(ficheSet.subjectId, subject.id))
    .where(eq(subject.userId, userId))
    .orderBy(asc(subject.ordre), asc(ficheSet.createdAt))
    .then((rows) => rows.map((r) => r.set));
}

export async function listFiches(userId: string, setId: string) {
  await loadOwnedSet(setId, userId);
  return db
    .select({
      id: fiche.id,
      numero: fiche.numero,
      titre: fiche.titre,
      statut: fiche.statut,
      due: reviewCard.due,
      reps: reviewCard.reps,
    })
    .from(fiche)
    .leftJoin(reviewCard, eq(reviewCard.ficheId, fiche.id))
    .where(eq(fiche.setId, setId))
    .orderBy(asc(fiche.numero));
}

export async function getFiche(userId: string, ficheId: string) {
  const owned = await loadOwnedFiche(ficheId, userId);
  const [card, cycles] = await Promise.all([
    db.query.reviewCard.findFirst({ where: eq(reviewCard.ficheId, ficheId) }),
    db.query.studyCycle.findMany({
      where: and(eq(studyCycle.ficheId, ficheId), isNotNull(studyCycle.note)),
      orderBy: [desc(studyCycle.closedAt)],
      limit: 20,
    }),
  ]);
  return { ...owned, card: card ?? null, cycles };
}
