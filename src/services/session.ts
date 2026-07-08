import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { studyCycle, studySession, correctionGuide, section, refileItem } from "@/db/schema";
import { assertSectionOwnership } from "./guide";
import * as errorService from "./error";
import * as auditService from "./audit";
import { buildCorrectionContext } from "@/llm/context/correction";
import { correctBlurting } from "@/llm/correctBlurting";
import {
  computeVerdict,
  presentCorrection,
  type MergedDiffPoint,
  type MergedErrorCandidate,
} from "@/core/correction/presentCorrection";
import type { GuideOutput } from "@/llm/schemas/guide";

// S4 · SessionService — partiel (FUNCTIONS §3, §7 ; PLAN Bloc 5.1) : start /
// submitBlurting / resolveOutcome (retenter, reveler) / abandon, plus un raccourci
// temporaire `terminerSessionTemporaire`. Ni feynman (Phase 7) ni révision/
// validateSection (Phase 6) ce bloc — entrée temporaire par le curriculum, le
// Planificateur n'existe pas encore (PLAN Bloc 5.1).

export class SectionNotReadyError extends Error {
  constructor() {
    super("La section n'est pas prête à être étudiée (rubrique non validée).");
  }
}

export class SessionAlreadyOpenError extends Error {
  constructor() {
    super("Une session est déjà ouverte sur une autre section.");
  }
}

export class NoCycleOpenError extends Error {
  constructor() {
    super("Aucune session ouverte pour cet utilisateur.");
  }
}

export class WrongCycleStateError extends Error {}

async function loadOwnedOpenCycle(userId: string, cycleId: string) {
  const cycle = await db.query.studyCycle.findFirst({ where: eq(studyCycle.id, cycleId) });
  if (!cycle || cycle.userId !== userId || cycle.closedAt !== null) throw new NoCycleOpenError();
  return cycle;
}

async function loadValidGuide(sectionId: string) {
  const guide = await db.query.correctionGuide.findFirst({
    where: and(eq(correctionGuide.sectionId, sectionId), eq(correctionGuide.statut, "valide")),
  });
  if (!guide) throw new SectionNotReadyError();
  return guide;
}

async function loadLatestSession(cycleId: string) {
  const sessions = await db.query.studySession.findMany({
    where: eq(studySession.cycleId, cycleId),
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  });
  return sessions[0] ?? null;
}

// Vérifie la rubrique via S3 (section `prete` ⇒ rubrique valide, contrainte DB en
// renfort) ; crée ou reprend — une seule session ouverte par utilisateur, invariant
// tenu par l'index unique partiel (ARCHITECTURE §8), doublé ici d'une vérification
// applicative pour une erreur lisible plutôt que l'exception Postgres brute.
export async function start(userId: string, sectionId: string) {
  const sec = await assertSectionOwnership(sectionId, userId);
  if (sec.statut !== "prete") throw new SectionNotReadyError();

  const openCycle = await db.query.studyCycle.findFirst({
    where: and(eq(studyCycle.userId, userId), isNull(studyCycle.closedAt)),
  });
  if (openCycle) {
    if (openCycle.sectionId === sectionId) return openCycle; // reprise
    throw new SessionAlreadyOpenError();
  }

  await loadValidGuide(sectionId); // garde défensive : `prete` implique déjà une rubrique valide

  const [cycle] = await db
    .insert(studyCycle)
    .values({ userId, sectionId, type: "etude", etat: "blurting" })
    .returning();
  return cycle;
}

// Sauvegarde AVANT tout appel LLM (FUNCTIONS §7) : la tentative est persistée
// (input seul) avant `correctBlurting` — si le LLM échoue après retries, le texte
// n'est jamais perdu (l'erreur se propage, la ligne reste sans `correction`).
export async function submitBlurting(userId: string, cycleId: string, blurtingText: string) {
  const cycle = await loadOwnedOpenCycle(userId, cycleId);
  if (cycle.etat !== "blurting") throw new WrongCycleStateError("Cette session n'attend pas de blurting.");

  const sec = await db.query.section.findFirst({ where: eq(section.id, cycle.sectionId) });
  if (!sec) throw new SectionNotReadyError();
  const guide = await loadValidGuide(cycle.sectionId);
  const points = (guide.contenu as GuideOutput).points;

  const previousAttempts = await db.query.studySession.findMany({ where: eq(studySession.cycleId, cycleId) });
  const tentative = previousAttempts.length + 1;

  // ARCHITECTURE §9 ligne 3+4 : erreurs actives DE LA SECTION (pas de la matière,
  // contrairement à L2) — détection de récidive sur ce périmètre précis.
  const erreursActives = await errorService.activeForSection(cycle.sectionId);

  const [savedSession] = await db
    .insert(studySession)
    .values({
      cycleId,
      sectionId: cycle.sectionId,
      guideId: guide.id,
      chapterVersion: sec.chapterVersion,
      type: "blurting",
      tentative,
      input: blurtingText,
      divulgation: "controlee",
    })
    .returning();

  await db.update(studyCycle).set({ etat: "correction" }).where(eq(studyCycle.id, cycleId));

  const context = buildCorrectionContext({
    points,
    blurting: blurtingText,
    tentative,
    erreursActives: erreursActives.map((e) => ({ id: e.id, type: e.type, description: e.description })),
  });

  const output = await correctBlurting(context);

  // `attendu` vient de la rubrique déjà en base, jamais du LLM (le cours ne lui a
  // jamais été envoyé) ; `point_index`/`recidive_index` résolus vers les vraies
  // données ici, une fois pour toutes (les LLM comptent mal, DECISIONS.md bloc 3.2).
  const diff: MergedDiffPoint[] = output.diff.map((d) => {
    const p = points[d.point_index - 1];
    return { intitule: p.intitule, type: p.type, statut: d.statut, attendu: p.attendu, explication: d.explication };
  });
  const erreursCandidates: MergedErrorCandidate[] = output.erreurs_candidates.map((e) => ({
    type: e.type,
    description: e.description,
    idErreurExistante: e.recidive_index != null ? erreursActives[e.recidive_index - 1].id : null,
  }));

  const verdict = computeVerdict(diff);
  const retryAttendu = verdict === "insuffisant";
  const divulgation = retryAttendu ? "controlee" : "complete";

  await db
    .update(studySession)
    .set({ correction: { diff, erreursCandidates }, verdictLlm: verdict, verdictFinal: verdict, divulgation })
    .where(eq(studySession.id, savedSession.id));

  // P10 appliqué ici, côté serveur exclusivement : les champs masqués ne sont
  // jamais construits pour le client (ARCHITECTURE §7).
  const filtered = presentCorrection({ diff, erreursCandidates }, { verdict, retryAttendu });
  return { cycleId, sessionId: savedSession.id, tentative, ...filtered };
}

export type ResolveOutcome = "retenter" | "reveler";

// 2 branches ce bloc (retenter, reveler) — "passer au Feynman" attend Phase 7
// (L4/L5), "valider sans Feynman" attend Phase 6 (S6.createCard). RefileItem
// écrit directement par S4 : S5 n'existe pas encore, la donnée précède l'écran
// (PLAN Bloc 5.2 ; DECISIONS.md bloc 5.1 — propriété migrera vers S5.refile).
export async function resolveOutcome(userId: string, cycleId: string, outcome: ResolveOutcome) {
  const cycle = await loadOwnedOpenCycle(userId, cycleId);
  if (cycle.etat !== "correction") throw new WrongCycleStateError("Aucune correction à résoudre.");

  const latest = await loadLatestSession(cycleId);
  if (!latest || latest.correction === null) throw new WrongCycleStateError("Aucune correction disponible.");
  if (latest.verdictFinal !== "insuffisant") {
    throw new WrongCycleStateError("Cette issue ne s'applique qu'à un verdict insuffisant.");
  }

  if (outcome === "reveler") {
    await db.update(studySession).set({ divulgation: "complete" }).where(eq(studySession.id, latest.id));
    await auditService.logEvent("revelation_correction", "study_session", latest.id);
  }

  // jamais de retry immédiat (ARCHITECTURE §5) : le prochain blurting attend la
  // re-file intra-journée, jamais la soumission courante.
  await db.insert(refileItem).values({
    date: new Date().toISOString().slice(0, 10),
    itemType: "etude",
    itemId: cycle.sectionId,
  });

  // boucle vers blurting_en_cours (machine B) : le cycle reste ouvert, seule une
  // nouvelle tentative (tentative n+1) peut le refermer.
  await db.update(studyCycle).set({ etat: "blurting" }).where(eq(studyCycle.id, cycleId));

  return { ok: true as const };
}

export async function abandon(userId: string, cycleId: string) {
  await loadOwnedOpenCycle(userId, cycleId);
  await db.update(studyCycle).set({ closedAt: new Date(), etat: "clos" }).where(eq(studyCycle.id, cycleId));
  return { ok: true as const };
}

// Raccourci TEMPORAIRE (PLAN Bloc 5.1) : ferme le cycle sur verdict acquis SANS
// transitionner la section (elle reste `prete`, aucune ReviewCard créée). Remplacé
// par S4.validateSection + S6.createCard en Phase 6 (PLAN Bloc 6.2) —
// DECISIONS.md bloc 5.1 pour le TODO daté.
export async function terminerSessionTemporaire(userId: string, cycleId: string) {
  await loadOwnedOpenCycle(userId, cycleId);
  const latest = await loadLatestSession(cycleId);
  if (!latest || latest.verdictFinal !== "acquis") {
    throw new WrongCycleStateError("terminerSessionTemporaire exige un verdict final acquis.");
  }
  await db.update(studyCycle).set({ closedAt: new Date(), etat: "clos" }).where(eq(studyCycle.id, cycleId));
  return { ok: true as const };
}
