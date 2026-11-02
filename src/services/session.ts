import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { fiche, studyCycle, tentative } from "@/db/schema";
import { loadOwnedFiche } from "./ownership";
import * as errorService from "./error";
import * as reviewService from "./review";
import * as plannerService from "./planner";
import { extractPoints, type PointFiche } from "@/core/fiche/extractPoints";
import { bilanAutoEvaluation, normaliserCoches } from "@/core/fiche/verdict";
import type { Note } from "@/core/fsrs/fsrsCore";

// SessionService — le cycle unique (ARCHITECTURE.md v2 §2). Propriétaire des
// invariants : une seule session ouverte par utilisateur ; ≤ 2 blurtings, le 2ᵉ
// seulement après relecture ; note limitée à Again/Hard après relecture. La
// correction est une auto-évaluation : comparaison côte à côte avec la fiche et
// cases cochées par l'étudiant (état `correction`), aucun appel LLM.
//
//   nouvelle :  lecture → blurting(1) → correction ─┬─ noter → clos
//   révision :            blurting(1) → correction ─┤
//                                                  └─ relire → lecture → blurting(2) → correction → noter (again|hard) → clos

export class FicheNonEtudiableError extends Error {
  constructor() {
    super("Cette fiche n'est pas à étudier (archivée ou introuvable).");
  }
}

export class SessionAlreadyOpenError extends Error {
  constructor() {
    super("Une session est déjà ouverte sur une autre fiche.");
  }
}

export class NoCycleOpenError extends Error {
  constructor() {
    super("Aucune session ouverte.");
  }
}

export class WrongCycleStateError extends Error {}

export const NOTES_APRES_RELECTURE: Note[] = ["again", "hard"];

// Ce que l'étudiant a coché en se corrigeant (indices dans extractPoints de la
// fiche telle qu'elle était à cette tentative, cf. `ficheHash`).
export interface CorrectionData {
  coches: number[];
}

async function loadOwnedOpenCycle(userId: string, cycleId: string) {
  const cycle = await db.query.studyCycle.findFirst({ where: eq(studyCycle.id, cycleId) });
  if (!cycle || cycle.userId !== userId || cycle.closedAt !== null) throw new NoCycleOpenError();
  return cycle;
}

async function tentatives(cycleId: string) {
  return db.query.tentative.findMany({ where: eq(tentative.cycleId, cycleId), orderBy: [asc(tentative.numero)] });
}

async function derniereTentative(cycleId: string) {
  const [last] = await db.query.tentative.findMany({
    where: eq(tentative.cycleId, cycleId),
    orderBy: [desc(tentative.numero)],
    limit: 1,
  });
  return last ?? null;
}

async function closeCycle(cycleId: string, note: Note | null) {
  await db.update(studyCycle).set({ etat: "clos", note, closedAt: new Date() }).where(eq(studyCycle.id, cycleId));
}

export interface OpenCycleInfo {
  cycleId: string;
  ficheId: string;
  ficheTitre: string;
  type: "etude" | "revision";
}

// Bandeau de reprise (shell) et lien depuis l'écran qui refuse une 2ᵉ session.
export async function findOpenCycle(userId: string): Promise<OpenCycleInfo | null> {
  const [row] = await db
    .select({ cycle: studyCycle, titre: fiche.titre })
    .from(studyCycle)
    .innerJoin(fiche, eq(studyCycle.ficheId, fiche.id))
    .where(and(eq(studyCycle.userId, userId), isNull(studyCycle.closedAt)));
  if (!row) return null;
  return { cycleId: row.cycle.id, ficheId: row.cycle.ficheId, ficheTitre: row.titre, type: row.cycle.type };
}

// Crée le cycle, ou reprend celui déjà ouvert sur cette fiche. Une révision
// commence au blurting (rappel à froid), une nouvelle fiche à la lecture.
export async function start(userId: string, ficheId: string) {
  const { fiche: f, set, subject } = await loadOwnedFiche(ficheId, userId);
  if (f.statut === "archivee" || set.statut !== "actif" || subject.statut !== "active") {
    throw new FicheNonEtudiableError();
  }

  const open = await db.query.studyCycle.findFirst({
    where: and(eq(studyCycle.userId, userId), isNull(studyCycle.closedAt)),
  });
  if (open) {
    if (open.ficheId === ficheId) return open;
    throw new SessionAlreadyOpenError();
  }

  const type = f.statut === "en_revision" ? "revision" : "etude";
  try {
    const [cycle] = await db
      .insert(studyCycle)
      .values({ userId, ficheId, type, etat: type === "revision" ? "blurting" : "lecture" })
      .returning();
    return cycle;
  } catch (e) {
    // Course entre la lecture ci-dessus et l'INSERT (deux onglets) : seul l'index
    // unique partiel est atomique.
    if ((e as { cause?: { code?: string } }).cause?.code === "23505") throw new SessionAlreadyOpenError();
    throw e;
  }
}

export async function terminerLecture(userId: string, cycleId: string): Promise<void> {
  const cycle = await loadOwnedOpenCycle(userId, cycleId);
  if (cycle.etat !== "lecture") throw new WrongCycleStateError("Cette session n'est pas en lecture.");
  await db.update(studyCycle).set({ etat: "blurting" }).where(eq(studyCycle.id, cycleId));
}

// Numéro de la prochaine tentative (1 ou 2) — lecture initiale vs relecture, badge.
export async function prochaineTentative(cycleId: string): Promise<number> {
  return (await tentatives(cycleId)).length + 1;
}

export async function submitBlurting(userId: string, cycleId: string, blurtingText: string) {
  const cycle = await loadOwnedOpenCycle(userId, cycleId);
  if (cycle.etat !== "blurting") throw new WrongCycleStateError("Cette session n'attend pas de blurting.");

  const numero = await prochaineTentative(cycleId);
  if (numero > 2) throw new WrongCycleStateError("Deux blurtings maximum par session.");

  const f = await db.query.fiche.findFirst({ where: eq(fiche.id, cycle.ficheId) });
  if (!f) throw new FicheNonEtudiableError();

  await db.insert(tentative).values({ cycleId, ficheId: f.id, ficheHash: f.contentHash, numero, input: blurtingText });
  await db.update(studyCycle).set({ etat: "correction" }).where(eq(studyCycle.id, cycleId));
  return { numero };
}

export interface Comparaison {
  tentativeId: string;
  numero: number;
  input: string;
  contenu: string;
  points: PointFiche[];
  erreursConnues: { type: string; description: string; occurrences: number }[];
}

// Écran de comparaison : la restitution, la fiche, ses points à cocher, et les
// erreurs déjà relevées sur cette fiche (pièges connus de l'étudiant).
export async function getComparaison(userId: string, cycleId: string): Promise<Comparaison> {
  const cycle = await loadOwnedOpenCycle(userId, cycleId);
  if (cycle.etat !== "correction") throw new WrongCycleStateError("Aucune comparaison pour cette session.");
  const last = await derniereTentative(cycleId);
  if (!last) throw new WrongCycleStateError("Aucune tentative pour cette session.");
  const f = await db.query.fiche.findFirst({ where: eq(fiche.id, cycle.ficheId) });
  if (!f) throw new FicheNonEtudiableError();
  const erreurs = await errorService.activeForFiche(f.id);
  return {
    tentativeId: last.id,
    numero: last.numero,
    input: last.input,
    contenu: f.contenu,
    points: extractPoints(f.contenu),
    erreursConnues: erreurs.map((e) => ({ type: e.type, description: e.description, occurrences: e.occurrences })),
  };
}

// Enregistre l'auto-évaluation sur la dernière tentative, en quittant l'écran.
async function enregistrerCoches(cycleId: string, ficheId: string, coches: number[]) {
  const last = await derniereTentative(cycleId);
  if (!last) throw new WrongCycleStateError("Aucune tentative pour cette session.");
  const f = await db.query.fiche.findFirst({ where: eq(fiche.id, ficheId) });
  if (!f) throw new FicheNonEtudiableError();
  const points = extractPoints(f.contenu);
  const correction: CorrectionData = { coches: normaliserCoches(coches, points.length) };
  const { verdict } = bilanAutoEvaluation(points, correction.coches);
  await db.update(tentative).set({ correction, verdict }).where(eq(tentative.id, last.id));
  return last;
}

// [Relire puis refaire] : seulement depuis la comparaison de la tentative 1.
export async function relire(userId: string, cycleId: string, coches: number[] = []): Promise<void> {
  const cycle = await loadOwnedOpenCycle(userId, cycleId);
  if (cycle.etat !== "correction") throw new WrongCycleStateError("Aucune comparaison à quitter.");
  if ((await prochaineTentative(cycleId)) - 1 !== 1) {
    throw new WrongCycleStateError("Une seule relecture par session.");
  }
  await enregistrerCoches(cycleId, cycle.ficheId, coches);
  await db.update(studyCycle).set({ etat: "lecture" }).where(eq(studyCycle.id, cycleId));
}

// Notes proposées à la clôture : toutes, sauf après une relecture (Again/Hard).
export async function notesPermises(cycleId: string): Promise<Note[]> {
  const n = (await tentatives(cycleId)).length;
  return n >= 2 ? NOTES_APRES_RELECTURE : ["again", "hard", "good", "easy"];
}

// Clôture : la note de l'utilisateur (jamais le verdict) pilote FSRS. Après une
// relecture, seules Again/Hard sont admises : le rappel à froid a échoué.
export async function noter(userId: string, cycleId: string, note: Note, coches: number[] = []) {
  const cycle = await loadOwnedOpenCycle(userId, cycleId);
  if (cycle.etat !== "correction") throw new WrongCycleStateError("Aucune comparaison à noter.");
  if (!(await notesPermises(cycleId)).includes(note)) {
    throw new WrongCycleStateError("Après une relecture, la note est Again ou Hard.");
  }

  await enregistrerCoches(cycleId, cycle.ficheId, coches);
  await reviewService.createOrRate(userId, cycle.ficheId, note);
  await db.update(fiche).set({ statut: "en_revision" }).where(eq(fiche.id, cycle.ficheId));
  if (note === "again") await plannerService.refile(cycle.type, cycle.ficheId);
  await closeCycle(cycleId, note);
}

// Ferme le cycle sans note : rien de visible ensuite, les tentatives restent en base.
export async function abandon(userId: string, cycleId: string) {
  await loadOwnedOpenCycle(userId, cycleId);
  await closeCycle(cycleId, null);
}
