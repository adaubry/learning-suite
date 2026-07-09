import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { studyCycle, studySession, correctionGuide, section, reviewCard } from "@/db/schema";
import { assertSectionOwnership } from "./guide";
import * as errorService from "./error";
import * as auditService from "./audit";
import * as reviewService from "./review";
import * as plannerService from "./planner";
import { buildCorrectionContext } from "@/llm/context/correction";
import { correctBlurting } from "@/llm/correctBlurting";
import {
  computeVerdict,
  presentCorrection,
  type MergedDiffPoint,
  type MergedErrorCandidate,
  type FilteredCorrection,
} from "@/core/correction/presentCorrection";
import type { GuideOutput, ControlPoint } from "@/llm/schemas/guide";
import type { Note } from "@/core/fsrs/fsrsCore";

// S4 · SessionService (FUNCTIONS §3, §7 ; PLAN Bloc 5.1 + 6.2 + 6.4) : start /
// submitBlurting / resolveOutcome (retenter, reveler) / abandon / validateSection /
// rateRevision. Feynman (L4/L5) reste hors périmètre (Phase 7).

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

// Numéro de la PROCHAINE tentative pour ce cycle (chaque StudySession est
// immuable, ADR 6) — exporté pour l'affichage (U15) avant toute soumission.
export async function nextTentative(cycleId: string) {
  const previousAttempts = await db.query.studySession.findMany({ where: eq(studySession.cycleId, cycleId) });
  return previousAttempts.length + 1;
}

type ErreursActives = Awaited<ReturnType<typeof errorService.activeForSection>>;

// Cœur partagé par submitBlurting (première tentative) et retryCorrection (échec
// LLM rejoué sans re-saisie, USER_FLOW É3.2) : appelle L3, résout point_index/
// recidive_index vers les vraies données, calcule le verdict, persiste, applique
// P10. `sessionId` désigne la ligne DÉJÀ sauvegardée (input toujours en base
// avant cet appel — FUNCTIONS §7) ; cette fonction ne fait qu'un UPDATE dessus.
// `cycleType` tranche `retryAttendu` (P10.DivulgationContext) : en révision, la
// divulgation est complète d'emblée quel que soit le verdict (ARCHITECTURE §6,
// P10 ne fait qu'appliquer ce que S4 décide).
async function runCorrection(
  sessionId: string,
  input: string,
  tentative: number,
  points: ControlPoint[],
  erreursActives: ErreursActives,
  cycleType: "etude" | "revision",
) {
  const context = buildCorrectionContext({
    points,
    blurting: input,
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
  const retryAttendu = cycleType === "etude" && verdict === "insuffisant";
  const divulgation = retryAttendu ? "controlee" : "complete";

  const [updated] = await db
    .update(studySession)
    .set({ correction: { diff, erreursCandidates }, verdictLlm: verdict, verdictFinal: verdict, divulgation })
    .where(eq(studySession.id, sessionId))
    .returning();

  // P10 appliqué ici, côté serveur exclusivement : les champs masqués ne sont
  // jamais construits pour le client (ARCHITECTURE §7).
  const filtered = presentCorrection({ diff, erreursCandidates }, { verdict, retryAttendu });
  return { cycleId: updated.cycleId, sessionId, tentative, ...filtered };
}

// Vérifie la rubrique via S3 (section `prete`/`en_revision` ⇒ rubrique valide,
// contrainte DB en renfort) ; crée ou reprend — une seule session ouverte par
// utilisateur, invariant tenu par l'index unique partiel (ARCHITECTURE §8),
// doublé ici d'une vérification applicative pour une erreur lisible plutôt que
// l'exception Postgres brute. Le type de cycle se déduit du statut de la
// section (`prete` ⇒ étude, `en_revision` ⇒ révision, USER_FLOW É4.1 : blurting
// de rappel identique à É3.1) — un seul point d'entrée pour les deux machines
// B/C, comme FUNCTIONS §3 n'en liste qu'un (`start`, pas de variante dédiée).
export async function start(userId: string, sectionId: string) {
  const sec = await assertSectionOwnership(sectionId, userId);
  if (sec.statut !== "prete" && sec.statut !== "en_revision") throw new SectionNotReadyError();
  const type: "etude" | "revision" = sec.statut === "en_revision" ? "revision" : "etude";

  const openCycle = await db.query.studyCycle.findFirst({
    where: and(eq(studyCycle.userId, userId), isNull(studyCycle.closedAt)),
  });
  if (openCycle) {
    if (openCycle.sectionId === sectionId) return openCycle; // reprise
    throw new SessionAlreadyOpenError();
  }

  await loadValidGuide(sectionId); // garde défensive : `prete`/`en_revision` implique déjà une rubrique valide

  if (type === "revision") {
    // Garde défensive : la file du jour (S5) exclut déjà les ReviewCards gelées
    // ou sans échéance due — cette vérification ne protège que l'accès direct à
    // l'URL, jamais atteint par le flux normal.
    const card = await db.query.reviewCard.findFirst({ where: eq(reviewCard.sectionId, sectionId) });
    if (!card || card.gelee) throw new SectionNotReadyError();
  }

  const [cycle] = await db.insert(studyCycle).values({ userId, sectionId, type, etat: "blurting" }).returning();
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

  const tentative = await nextTentative(cycleId);

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

  return runCorrection(savedSession.id, blurtingText, tentative, points, erreursActives, cycle.type);
}

// USER_FLOW É3.2 : « le blurting est TOUJOURS sauvegardé d'abord ; [Relancer la
// correction] sans re-saisie » — rejoue L3 sur la tentative déjà persistée dont
// l'appel a échoué (`correction` encore NULL), sans en créer une nouvelle.
export async function retryCorrection(userId: string, cycleId: string) {
  const cycle = await loadOwnedOpenCycle(userId, cycleId);
  if (cycle.etat !== "correction") throw new WrongCycleStateError("Aucune correction en attente.");

  const latest = await loadLatestSession(cycleId);
  if (!latest || latest.correction !== null) {
    throw new WrongCycleStateError("Aucune tentative en échec à relancer.");
  }

  const guide = await db.query.correctionGuide.findFirst({ where: eq(correctionGuide.id, latest.guideId) });
  if (!guide) throw new SectionNotReadyError();
  const points = (guide.contenu as GuideOutput).points;

  const erreursActives = await errorService.activeForSection(cycle.sectionId);

  return runCorrection(latest.id, latest.input, latest.tentative, points, erreursActives, cycle.type);
}

export type CurrentCorrection =
  | { status: "pending"; cycleId: string; sessionId: string; tentative: number }
  | ({ status: "ready"; cycleId: string; sessionId: string; tentative: number } & FilteredCorrection);

// Re-sert une correction déjà persistée (reprise d'un rechargement de l'écran) —
// aucun appel LLM ici, seulement une ré-application de P10 sur le JSON déjà en
// base, avec la divulgation déjà tranchée (`StudySession.divulgation`).
export async function getCurrentCorrection(userId: string, cycleId: string): Promise<CurrentCorrection> {
  const cycle = await loadOwnedOpenCycle(userId, cycleId);
  if (cycle.etat !== "correction") throw new WrongCycleStateError("Aucune correction pour ce cycle.");

  const latest = await loadLatestSession(cycleId);
  if (!latest) throw new WrongCycleStateError("Aucune tentative pour ce cycle.");

  if (latest.correction === null) {
    return { status: "pending", cycleId, sessionId: latest.id, tentative: latest.tentative };
  }

  const { diff, erreursCandidates } = latest.correction as {
    diff: MergedDiffPoint[];
    erreursCandidates: MergedErrorCandidate[];
  };
  const filtered = presentCorrection(
    { diff, erreursCandidates },
    { verdict: latest.verdictFinal!, retryAttendu: latest.divulgation === "controlee" },
  );
  return { status: "ready", cycleId, sessionId: latest.id, tentative: latest.tentative, ...filtered };
}

export type ResolveOutcome = "retenter" | "reveler";

export type ResolveOutcomeResult =
  | { outcome: "retenter" }
  | ({ outcome: "reveler" } & FilteredCorrection);

// 2 branches ce bloc (retenter, reveler) — "passer au Feynman" attend Phase 7
// (L4/L5), "valider sans Feynman" attend Phase 6 (S6.createCard). RefileItem
// écrit directement par S4 : S5 n'existe pas encore, la donnée précède l'écran
// (PLAN Bloc 5.2 ; DECISIONS.md bloc 5.1 — propriété migrera vers S5.refile).
//
// Les deux branches font boucler le cycle vers `blurting` (la prochaine tentative
// attend la re-file, jamais un retry immédiat) — mais `reveler` doit d'abord
// montrer les réponses : renvoyer la vue complètement divulguée ICI évite de la
// re-lire ensuite via getCurrentCorrection, qui exigerait `etat: correction` déjà
// quitté à ce point.
export async function resolveOutcome(
  userId: string,
  cycleId: string,
  outcome: ResolveOutcome,
  rejectedCandidateIndexes: number[] = [],
): Promise<ResolveOutcomeResult> {
  const cycle = await loadOwnedOpenCycle(userId, cycleId);
  if (cycle.etat !== "correction") throw new WrongCycleStateError("Aucune correction à résoudre.");

  const latest = await loadLatestSession(cycleId);
  if (!latest || latest.correction === null) throw new WrongCycleStateError("Aucune correction disponible.");
  if (latest.verdictFinal !== "insuffisant") {
    throw new WrongCycleStateError("Cette issue ne s'applique qu'à un verdict insuffisant.");
  }

  // USER_FLOW É3.2 « Règle de commit » : quitter l'écran (ici : retenter/révéler)
  // commit les candidates — acceptées explicitement ou non statuées, jamais les
  // rejetées (S7.commitCandidates, Bloc 5.3).
  await errorService.commitCandidates(userId, latest.id, rejectedCandidateIndexes);

  let result: ResolveOutcomeResult = { outcome: "retenter" };

  if (outcome === "reveler") {
    await db.update(studySession).set({ divulgation: "complete" }).where(eq(studySession.id, latest.id));
    await auditService.logEvent("revelation_correction", "study_session", latest.id);

    const { diff, erreursCandidates } = latest.correction as {
      diff: MergedDiffPoint[];
      erreursCandidates: MergedErrorCandidate[];
    };
    const filtered = presentCorrection({ diff, erreursCandidates }, { verdict: latest.verdictFinal, retryAttendu: false });
    result = { outcome: "reveler", ...filtered };
  }

  // jamais de retry immédiat (ARCHITECTURE §5) : le prochain blurting attend la
  // re-file intra-journée, jamais la soumission courante.
  await plannerService.refile("etude", cycle.sectionId);

  // boucle vers blurting_en_cours (machine B) : le cycle reste ouvert, seule une
  // nouvelle tentative (tentative n+1) peut le refermer.
  await db.update(studyCycle).set({ etat: "blurting" }).where(eq(studyCycle.id, cycleId));

  return result;
}

export async function abandon(userId: string, cycleId: string) {
  await loadOwnedOpenCycle(userId, cycleId);
  await db.update(studyCycle).set({ closedAt: new Date(), etat: "clos" }).where(eq(studyCycle.id, cycleId));
  return { ok: true as const };
}

// validateSection (FUNCTIONS §3 S4 ; PLAN Bloc 6.2, remplace le raccourci
// terminerSessionTemporaire — DECISIONS.md bloc 5.1) : décision utilisateur sur
// verdict acquis → section `validee`, ReviewCard créée (S6.createCard) → section
// `en_revision` (Machine A, ARCHITECTURE §4), cycle refermé. Feynman requis si
// importance ≥ 3 NON appliqué ce bloc-ci (PLAN Bloc 6.2 : bypass temporaire pour
// toutes les importances, restriction rétablie en Phase 7).
export async function validateSection(
  userId: string,
  cycleId: string,
  rejectedCandidateIndexes: number[] = [],
) {
  const cycle = await loadOwnedOpenCycle(userId, cycleId);
  const latest = await loadLatestSession(cycleId);
  if (!latest || latest.verdictFinal !== "acquis") {
    throw new WrongCycleStateError("validateSection exige un verdict final acquis.");
  }
  // Même règle de commit qu'à la sortie via resolveOutcome (USER_FLOW É3.2).
  await errorService.commitCandidates(userId, latest.id, rejectedCandidateIndexes);

  await db.update(section).set({ statut: "validee" }).where(eq(section.id, cycle.sectionId));

  // Une ReviewCard peut déjà exister : section repassée `prete` après 2×Again
  // (Machine C) puis re-étudiée avec succès. Décision tranchée avec l'humain
  // (récitation Bloc 6.4) : on conserve la carte existante (historique FSRS —
  // stability/difficulty/lapses — jamais réinitialisé), on ne fait qu'ignorer
  // l'erreur d'unicité plutôt que la lever à l'appelant.
  try {
    await reviewService.createCard(userId, cycle.sectionId);
  } catch (e) {
    if (!(e instanceof reviewService.ReviewCardAlreadyExistsError)) throw e;
  }
  await db.update(section).set({ statut: "en_revision" }).where(eq(section.id, cycle.sectionId));

  await db.update(studyCycle).set({ closedAt: new Date(), etat: "clos" }).where(eq(studyCycle.id, cycleId));
  return { ok: true as const };
}

// rateRevision (FUNCTIONS §3 S4 ; ARCHITECTURE §6 Machine C ; PLAN Bloc 6.4) :
// auto-note utilisateur → S6.rate (jamais le verdict LLM, ADR 3) ; Again ⇒
// re-file intra-journée (S5.refile) ; 2ᵉ Again CONSÉCUTIF (la révision
// précédente de cette section était elle aussi notée Again) ⇒ section `prete`,
// retour en étude complète (Machine A). Contrairement à l'étude, une révision
// ne boucle jamais sur le même cycle (pas de retry — divulgation déjà complète
// dès la correction) : chaque révision ferme son propre StudyCycle.
export async function rateRevision(
  userId: string,
  cycleId: string,
  note: Note,
  rejectedCandidateIndexes: number[] = [],
) {
  const cycle = await loadOwnedOpenCycle(userId, cycleId);
  if (cycle.type !== "revision") {
    throw new WrongCycleStateError("rateRevision ne s'applique qu'à un cycle de révision.");
  }
  if (cycle.etat !== "correction") throw new WrongCycleStateError("Aucune correction à noter.");

  const latest = await loadLatestSession(cycleId);
  if (!latest || latest.correction === null) throw new WrongCycleStateError("Aucune correction disponible.");

  await errorService.commitCandidates(userId, latest.id, rejectedCandidateIndexes);
  await db.update(studySession).set({ noteFsrs: note }).where(eq(studySession.id, latest.id));
  await reviewService.rate(userId, cycle.sectionId, note);

  let secondConsecutiveAgain = false;
  if (note === "again") {
    const previousCycle = await db.query.studyCycle.findFirst({
      where: and(
        eq(studyCycle.userId, userId),
        eq(studyCycle.sectionId, cycle.sectionId),
        eq(studyCycle.type, "revision"),
        ne(studyCycle.id, cycleId),
      ),
      orderBy: (c, { desc }) => [desc(c.closedAt)],
    });
    const previousSession =
      previousCycle &&
      (await db.query.studySession.findFirst({
        where: eq(studySession.cycleId, previousCycle.id),
        orderBy: (s, { desc }) => [desc(s.createdAt)],
      }));
    secondConsecutiveAgain = previousSession?.noteFsrs === "again";
  }

  if (secondConsecutiveAgain) {
    await db.update(section).set({ statut: "prete" }).where(eq(section.id, cycle.sectionId));
  } else if (note === "again") {
    await plannerService.refile("revision", cycle.sectionId);
  }

  await db.update(studyCycle).set({ closedAt: new Date(), etat: "clos" }).where(eq(studyCycle.id, cycleId));
  return { ok: true as const };
}
