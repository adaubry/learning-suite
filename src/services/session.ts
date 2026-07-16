import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { studyCycle, studySession, correctionGuide, section, reviewCard, chapter } from "@/db/schema";
import { assertSectionOwnership } from "./guide";
import * as errorService from "./error";
import * as auditService from "./audit";
import * as reviewService from "./review";
import * as plannerService from "./planner";
import { buildCorrectionContext } from "@/llm/context/correction";
import { correctBlurting } from "@/llm/correctBlurting";
import { buildTranscriptionContext } from "@/llm/context/transcription";
import { transcribeAudio } from "@/llm/transcribeAudio";
import { buildFeynmanTurnContext, type FeynmanTour } from "@/llm/context/feynmanTurn";
import { feynmanTurn as feynmanTurnLLM } from "@/llm/feynmanTurn";
import { buildFeynmanBilanContext } from "@/llm/context/feynmanBilan";
import { feynmanReport as feynmanReportLLM } from "@/llm/feynmanReport";
import { computeFeynmanVerdict } from "@/core/feynman/computeFeynmanVerdict";
import { computeVerdict, type MergedDiffPoint, type MergedErrorCandidate } from "@/core/correction/verdict";
import type { GuideOutput, ControlPoint } from "@/llm/schemas/guide";
import type { Note } from "@/core/fsrs/fsrsCore";
import type { EmphasisSegment } from "@/core/parser/types";

// S4 · SessionService (FUNCTIONS §3, §7 ; PLAN Bloc 5.1 + 6.2 + 6.4 + 7.1 + 7.2 ;
// REVAMP v2 2026-07-15 ; fusion Machine B/C 2026-07-15, DECISIONS.md) : start
// (TOUT cycle démarre en `lecture`, étude ou révision) / terminerLecture /
// lectureContext / submitBlurting (2 passes max, uniforme) / resolveOutcome
// (relire, boucle vers lecture) / abandon / validateSection (Feynman
// obligatoire toute importance 2 à 5 + auto-note FSRS obligatoire pour clore,
// S6.createOrRate — remplace `rateRevision`, supprimée) / transcribe (L6,
// Bloc 7.1) / beginFeynman (inconditionnel), openingTurn, feynmanTurn (brouillon
// injecté), closeFeynman, beginRestartFeynman, returnToBlurting (L4/L5).

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

async function subjectIdForSection(sectionId: string): Promise<string> {
  const sec = await db.query.section.findFirst({ where: eq(section.id, sectionId) });
  if (!sec) throw new SectionNotReadyError();
  const chap = await db.query.chapter.findFirst({ where: eq(chapter.id, sec.chapterId) });
  if (!chap) throw new SectionNotReadyError();
  return chap.subjectId;
}

// ARCHITECTURE §9 ligne 5 : erreurs actives de LA SECTION ET de LA MATIÈRE
// (contrairement à L3, section seule) — fusionnées, dédupliquées par id.
async function activeErreursForFeynman(sectionId: string, subjectId: string) {
  const [parSection, parMatiere] = await Promise.all([
    errorService.activeForSection(sectionId),
    errorService.activeFor(subjectId),
  ]);
  const parId = new Map([...parSection, ...parMatiere].map((e) => [e.id, e]));
  return Array.from(parId.values());
}

// Reconstruit l'historique du dialogue depuis les StudySession type=feynman
// (chacune : { input: transcript étudiant (vide pour le tour d'ouverture),
// correction: { relance: string } }) — ordre chronologique, une session = au
// plus une paire {étudiant?, ia}.
// REVAMP v2 (2026-07-15) : dernier brouillon de blurting soumis pour ce cycle,
// injecté dans le contexte Feynman (§9 ligne 5) — les relances se construisent
// comme un développement progressif de ce texte, pas une exploration libre.
async function loadLatestBlurtingInput(cycleId: string): Promise<string> {
  const rows = await db.query.studySession.findMany({
    where: and(eq(studySession.cycleId, cycleId), eq(studySession.type, "blurting")),
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  });
  return rows[0]?.input ?? "";
}

async function loadFeynmanTours(cycleId: string): Promise<FeynmanTour[]> {
  const sessions = await db.query.studySession.findMany({
    where: and(eq(studySession.cycleId, cycleId), eq(studySession.type, "feynman")),
    orderBy: (s, { asc }) => [asc(s.createdAt)],
  });
  const tours: FeynmanTour[] = [];
  for (const s of sessions) {
    if (s.input) tours.push({ role: "etudiant", texte: s.input });
    const { relance } = s.correction as { relance: string };
    tours.push({ role: "ia", texte: relance });
  }
  return tours;
}

export interface FeynmanBilan {
  points: { intitule: string; type: "critique" | "important" | "secondaire"; statut: string; commentaire: string }[];
  pointsSolides: string[];
  lacunes: string[];
  verdict: "acquis" | "insuffisant";
}

// Streame la relance L4 et persiste le tour (StudySession type=feynman) une fois
// le flux épuisé — partagé par startFeynman (tour d'ouverture, transcript vide)
// et feynmanTurn (tour normal).
async function* streamAndPersistTurn(
  cycleId: string,
  sectionId: string,
  guideId: string,
  chapterVersion: number,
  transcript: string,
  context: ReturnType<typeof buildFeynmanTurnContext>,
): AsyncGenerator<string> {
  const tentative = await nextTentative(cycleId);
  let full = "";
  for await (const chunk of feynmanTurnLLM(context)) {
    full += chunk;
    yield chunk;
  }
  await db.insert(studySession).values({
    cycleId,
    sectionId,
    guideId,
    chapterVersion,
    type: "feynman",
    tentative,
    input: transcript,
    correction: { relance: full },
    divulgation: "complete",
  });
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
// recidive_index vers les vraies données, calcule le verdict, persiste. Divulgation
// toujours complète (REVAMP v2, 2026-07-15 : `presentCorrection`/P10 supprimé,
// plus aucun filtrage à appliquer — déjà écrite "complete" à l'insert, cf.
// submitBlurting). `sessionId` désigne la ligne DÉJÀ sauvegardée (input toujours
// en base avant cet appel — FUNCTIONS §7) ; cette fonction ne fait qu'un UPDATE dessus.
async function runCorrection(
  sessionId: string,
  input: string,
  tentative: number,
  points: ControlPoint[],
  erreursActives: ErreursActives,
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

  const [updated] = await db
    .update(studySession)
    .set({ correction: { diff, erreursCandidates }, verdictLlm: verdict, verdictFinal: verdict })
    .where(eq(studySession.id, sessionId))
    .returning();

  return { cycleId: updated.cycleId, sessionId, tentative, verdict, diff, erreursCandidates };
}

// Vérifie la rubrique via S3 (section `prete`/`en_revision` ⇒ rubrique valide,
// contrainte DB en renfort) ; crée ou reprend — une seule session ouverte par
// utilisateur, invariant tenu par l'index unique partiel (ARCHITECTURE §8),
// doublé ici d'une vérification applicative pour une erreur lisible plutôt que
// l'exception Postgres brute. Le type de cycle se déduit du statut de la
// section (`prete` ⇒ étude, `en_revision` ⇒ révision, USER_FLOW É4.1 : blurting
// de rappel identique à É3.1) — un seul point d'entrée pour les deux machines
// B/C, comme FUNCTIONS §3 n'en liste qu'un (`start`, pas de variante dédiée).
export interface OpenCycleInfo {
  cycleId: string;
  sectionId: string;
  sectionTitre: string;
  type: "etude" | "revision";
}

// findOpenCycle : lecture seule, sert deux besoins produit — (1) l'écran qui
// refuse `start` sur une AUTRE section (SessionAlreadyOpenError) doit pouvoir
// proposer un lien direct vers la session réellement ouverte, pas seulement un
// message ; (2) un bandeau dans le shell (app)/ doit rester visible sur tout
// écran atteint par retour/accueil pendant qu'une session traîne ouverte
// ailleurs — incident réel constaté en usage (pas d'accès simple pour y revenir).
export async function findOpenCycle(userId: string): Promise<OpenCycleInfo | null> {
  const cycle = await db.query.studyCycle.findFirst({
    where: and(eq(studyCycle.userId, userId), isNull(studyCycle.closedAt)),
  });
  if (!cycle) return null;
  const sec = await db.query.section.findFirst({ where: eq(section.id, cycle.sectionId) });
  if (!sec) return null;
  return { cycleId: cycle.id, sectionId: cycle.sectionId, sectionTitre: sec.titre, type: cycle.type };
}

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

  // Fusion Machine B/C (2026-07-15, DECISIONS.md) : TOUT cycle démarre en
  // `lecture` désormais, qu'il s'agisse d'une première étude ou d'une
  // répétition due (`type` ne pilote plus aucune branche, c'est un label pur —
  // badge, tri du Planificateur ADR 8).
  try {
    const [cycle] = await db.insert(studyCycle).values({ userId, sectionId, type, etat: "lecture" }).returning();
    return cycle;
  } catch (e) {
    // Fenêtre de course entre la lecture ci-dessus et cet INSERT (deux devices
    // qui démarrent une session au même instant) : la lecture seule ne suffit
    // pas à l'empêcher (TOCTOU), seul l'index unique partiel
    // (study_cycle_one_open_per_user, schema.ts) est atomique. Sans ce garde,
    // l'appelant perdant reçoit une DrizzleQueryError brute au lieu du
    // SessionAlreadyOpenError attendu — reproduit empiriquement via deux
    // session.start() concurrentes sur le Docker local.
    if ((e as { cause?: { code?: string } }).cause?.code === "23505") {
      throw new SessionAlreadyOpenError();
    }
    throw e;
  }
}

// terminerLecture (REVAMP v2, FUNCTIONS §3 S4) : transition SEULE `lecture →
// blurting`, même patron que beginFeynman — appelée depuis les deux écrans de
// lecture (initiale et relecture ciblée), un seul point d'entrée. La lecture
// est structurelle (pas de minuteur) : ce garde d'état est ce qui empêche de
// sauter l'étape, pas une contrainte de durée.
export async function terminerLecture(userId: string, cycleId: string): Promise<void> {
  const cycle = await loadOwnedOpenCycle(userId, cycleId);
  if (cycle.etat !== "lecture") throw new WrongCycleStateError("Cette session n'est pas en lecture.");
  await db.update(studyCycle).set({ etat: "blurting" }).where(eq(studyCycle.id, cycleId));
}

export type LectureContext =
  | { tentative: 1; diff: null }
  | { tentative: 2; diff: MergedDiffPoint[] };

// lectureContext (REVAMP v2) : ce qu'il faut pour rendre l'écran de lecture —
// la tentative à venir (1 = lecture initiale, texte seul ; 2 = relecture
// ciblée, texte + diff de la correction_1 en vis-à-vis, §2.7 REVAMP.md).
export async function lectureContext(userId: string, cycleId: string): Promise<LectureContext> {
  const cycle = await loadOwnedOpenCycle(userId, cycleId);
  if (cycle.etat !== "lecture") throw new WrongCycleStateError("Cette session n'est pas en lecture.");

  const tentative = await nextTentative(cycleId);
  if (tentative === 1) return { tentative, diff: null };

  const latest = await loadLatestSession(cycleId);
  const { diff } = latest!.correction as { diff: MergedDiffPoint[] };
  return { tentative: 2, diff };
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
  // REVAMP v2 (2026-07-15, rupture B) + fusion Machine B/C (2026-07-15) :
  // exactement 2 passes de blurting max, la 2ᵉ immédiate dans la même séance
  // (jamais de re-file) — s'applique désormais uniformément, plus de
  // distinction étude/révision (`cycle.type` n'est qu'un label).
  if (tentative > 2) {
    throw new WrongCycleStateError("Deux tentatives de blurting maximum.");
  }

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
      // Divulgation toujours complète (REVAMP v2) : littéral, plus de logique
      // conditionnelle — la colonne reste pour la fidélité des lignes v1
      // historiques (ARCHITECTURE §8), jamais relue en logique désormais.
      divulgation: "complete",
    })
    .returning();

  await db.update(studyCycle).set({ etat: "correction" }).where(eq(studyCycle.id, cycleId));

  return runCorrection(savedSession.id, blurtingText, tentative, points, erreursActives);
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

  return runCorrection(latest.id, latest.input, latest.tentative, points, erreursActives);
}

export type CurrentCorrection =
  | { status: "pending"; cycleId: string; sessionId: string; tentative: number }
  | {
      status: "ready";
      cycleId: string;
      sessionId: string;
      tentative: number;
      verdict: "acquis" | "insuffisant";
      input: string;
      diff: MergedDiffPoint[];
      erreursCandidates: MergedErrorCandidate[];
    };

// Re-sert une correction déjà persistée (reprise d'un rechargement de l'écran) —
// aucun appel LLM ici, seulement une relecture du JSON déjà en base (divulgation
// toujours complète, REVAMP v2 : plus de filtrage à ré-appliquer).
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
  return {
    status: "ready",
    cycleId,
    sessionId: latest.id,
    tentative: latest.tentative,
    verdict: latest.verdictFinal!,
    input: latest.input,
    diff,
    erreursCandidates,
  };
}

// resolveOutcome (REVAMP v2, 2026-07-15, rupture B) : [Relire, puis refaire un
// blurting] depuis l'écran de correction — n'est acceptée qu'à la 1ʳᵉ tentative
// (pas de 3ᵉ passe, cf. submitBlurting) ; boucle vers `lecture` (relecture
// ciblée, pas directement `blurting`), IMMÉDIATEMENT dans la même séance —
// aucun appel à `plannerService.refile`, jamais de re-file/délai en étude.
// Le verdict n'y conditionne plus rien (informatif, ARCHITECTURE §5) : cette
// issue est disponible quel que soit le verdict. La branche `reveler` disparaît
// (divulgation déjà complète, rien à révéler) ; `[Abandonner]` depuis cet écran
// est un appel direct à `abandon`, pas une branche ici.
export async function resolveOutcome(
  userId: string,
  cycleId: string,
  rejectedCandidateIndexes: number[] = [],
): Promise<void> {
  const cycle = await loadOwnedOpenCycle(userId, cycleId);
  if (cycle.etat !== "correction") throw new WrongCycleStateError("Aucune correction à résoudre.");

  const latest = await loadLatestSession(cycleId);
  if (!latest || latest.correction === null) throw new WrongCycleStateError("Aucune correction disponible.");
  if (latest.tentative !== 1) {
    throw new WrongCycleStateError("Une seule relecture est possible : la 2ᵉ tentative est déjà atteinte.");
  }

  // USER_FLOW É3.3 « Règle de commit » : quitter l'écran (ici : relire/refaire)
  // commit les candidates — acceptées explicitement ou non statuées, jamais les
  // rejetées (S7.commitCandidates, Bloc 5.3).
  await errorService.commitCandidates(userId, latest.id, rejectedCandidateIndexes);

  // boucle vers lecture_2 (relecture ciblée) : le cycle reste ouvert, seule une
  // nouvelle tentative (tentative n+1) peut le faire progresser.
  await db.update(studyCycle).set({ etat: "lecture" }).where(eq(studyCycle.id, cycleId));
}

export async function abandon(userId: string, cycleId: string) {
  await loadOwnedOpenCycle(userId, cycleId);
  await db.update(studyCycle).set({ closedAt: new Date(), etat: "clos" }).where(eq(studyCycle.id, cycleId));
  return { ok: true as const };
}

// beginFeynman (FUNCTIONS §3 S4 « feynman » ; USER_FLOW É3.3 [Passer au Feynman] ;
// PLAN Bloc 7.2, REVAMP v2 2026-07-15 rupture C) : quitte l'écran de correction
// vers le dialogue — même « Règle de commit » que les autres sorties d'É3.3
// (relire+refaire/terminer), donc commit des candidates ICI (jamais rejoué
// ensuite sur cette même session, doctrine S7.commitCandidates). Transition
// INCONDITIONNELLE, quel que soit le verdict : plus de garde, plus d'override,
// plus de journalisation à ce point (le verdict informe, il ne bloque plus
// rien — ARCHITECTURE §5). Guard + transition SEULE (pas de génération) :
// appelée depuis un Server Action classique (redirect), pas depuis la route de
// streaming — laisse le tour d'ouverture streamer séparément une fois sur
// l'écran Feynman (openingTurn), pour un vrai streaming dès la première
// relance (pas seulement les suivantes).
export async function beginFeynman(userId: string, cycleId: string, rejectedCandidateIndexes: number[] = []): Promise<void> {
  const cycle = await loadOwnedOpenCycle(userId, cycleId);
  if (cycle.etat !== "correction") throw new WrongCycleStateError("Aucune correction à quitter vers le Feynman.");

  const latest = await loadLatestSession(cycleId);
  if (!latest || latest.correction === null) throw new WrongCycleStateError("Aucune correction disponible.");

  await errorService.commitCandidates(userId, latest.id, rejectedCandidateIndexes);

  await db.update(studyCycle).set({ etat: "feynman" }).where(eq(studyCycle.id, cycleId));
}

// feynmanHistorique : lecture seule, sert à reprendre un dialogue déjà entamé
// (page rechargée, retour en arrière puis en avant, etc.) SANS régénérer de
// tour d'ouverture — incident réel constaté en usage : sans ça, le client
// n'avait aucun moyen de savoir qu'une conversation existait déjà et rappelait
// "opening" à chaque montage, injectant une question déconnectée au milieu de
// l'échange (openingTurn n'a plus de garde contre un second appel depuis qu'il
// sert aussi la reprise après bilan — ADR 6, historique jamais effacé).
export async function feynmanHistorique(userId: string, cycleId: string): Promise<FeynmanTour[]> {
  await loadOwnedOpenCycle(userId, cycleId);
  return loadFeynmanTours(cycleId);
}

// feynmanTurn (FUNCTIONS §3 S4 « feynman » ; USER_FLOW É3.3 ; PLAN Bloc 7.2) :
// un tour — transcript édité de l'étudiant (déjà produit par U20/S4.transcribe,
// vide pour le tout premier tour d'ouverture) → relance streamée (L4), ciblant
// l'historique RÉEL de CETTE session (vide la toute première fois ; non vide
// après beginRestartFeynman, qui préserve l'historique passé, ADR 6 — l'IA
// n'oublie pas ce qui a déjà été dit) + erreurs actives.
export async function* feynmanTurn(userId: string, cycleId: string, transcript: string): AsyncGenerator<string> {
  const cycle = await loadOwnedOpenCycle(userId, cycleId);
  if (cycle.etat !== "feynman") throw new WrongCycleStateError("Aucun dialogue Feynman en cours.");

  const guide = await loadValidGuide(cycle.sectionId);
  const points = (guide.contenu as GuideOutput).points;

  const sec = await db.query.section.findFirst({ where: eq(section.id, cycle.sectionId) });
  if (!sec) throw new SectionNotReadyError();
  const subjectId = await subjectIdForSection(cycle.sectionId);
  const [erreursActives, historique, brouillon] = await Promise.all([
    activeErreursForFeynman(cycle.sectionId, subjectId),
    loadFeynmanTours(cycleId),
    loadLatestBlurtingInput(cycleId),
  ]);

  const context = buildFeynmanTurnContext({
    points,
    contenuSection: sec.contenu,
    erreursActives: erreursActives.map((e) => ({ type: e.type, description: e.description })),
    historique,
    dernierTranscript: transcript,
    brouillon,
  });
  yield* streamAndPersistTurn(cycleId, cycle.sectionId, guide.id, sec.chapterVersion, transcript, context);
}

// openingTurn (USER_FLOW É3.3 « Premier message IA : invitation à expliquer… » ;
// aussi réutilisée par [Refaire un Feynman], USER_FLOW É3.4) : un tour d'ouverture
// est un feynmanTurn sans transcript — même fonction, transcript vide.
export const openingTurn = (userId: string, cycleId: string): AsyncGenerator<string> => feynmanTurn(userId, cycleId, "");

// closeFeynman (FUNCTIONS §3 S4 « feynman » clôture ; USER_FLOW É3.3 [Clore et
// demander le bilan] → É3.4 ; PLAN Bloc 7.2) : appelle L5 sur l'historique complet,
// résout `type` de chaque point depuis la rubrique locale (jamais le LLM,
// même doctrine que L3/point_index — DECISIONS.md bloc 5.1), calcule le verdict
// en code (computeFeynmanVerdict), persiste le bilan sur le cycle (UN par cycle,
// pas une StudySession — study_session_type n'a pas de valeur "bilan").
export async function closeFeynman(userId: string, cycleId: string): Promise<FeynmanBilan> {
  const cycle = await loadOwnedOpenCycle(userId, cycleId);
  if (cycle.etat !== "feynman") throw new WrongCycleStateError("Aucun dialogue Feynman en cours.");

  const guide = await loadValidGuide(cycle.sectionId);
  const points = (guide.contenu as GuideOutput).points;
  const historique = await loadFeynmanTours(cycleId);

  const bilanContext = buildFeynmanBilanContext({ points, historique });
  const output = await feynmanReportLLM(bilanContext);

  const bilanPoints = output.points.map((p) => {
    const point = points[p.point_index - 1];
    return { intitule: point.intitule, type: point.type, statut: p.statut, commentaire: p.commentaire };
  });
  const verdict = computeFeynmanVerdict(bilanPoints.map((p) => ({ type: p.type, statut: p.statut })));
  const bilan: FeynmanBilan = {
    points: bilanPoints,
    pointsSolides: output.points_solides,
    lacunes: output.lacunes,
    verdict,
  };

  await db.update(studyCycle).set({ etat: "bilan", bilanFeynman: bilan }).where(eq(studyCycle.id, cycleId));
  return bilan;
}

// beginRestartFeynman (USER_FLOW É3.4 [Refaire un Feynman] → « É3.3, nouvelle
// session » ; PLAN Bloc 7.2) : transition SEULE (même patron que beginFeynman),
// reprend le MÊME cycle (immuabilité ADR 6 — l'historique des tours passés
// n'est jamais effacé, seulement le bilan qui devient caduc). Le tour d'ouverture
// streame séparément via openingTurn, qui relit l'historique réel (non vide ici).
export async function beginRestartFeynman(userId: string, cycleId: string): Promise<void> {
  const cycle = await loadOwnedOpenCycle(userId, cycleId);
  if (cycle.etat !== "bilan") throw new WrongCycleStateError("Aucun bilan à reprendre.");
  await db.update(studyCycle).set({ etat: "feynman", bilanFeynman: null }).where(eq(studyCycle.id, cycleId));
}

// returnToBlurting (USER_FLOW É3.4 [Revenir au blurting] → « re-file intra-journée » ;
// PLAN Bloc 7.2) : abandonne cette tentative Feynman, la section repasse par le
// vivier du jour (S5.refile, même mécanique que resolveOutcome « retenter » —
// jamais de retry immédiat, ARCHITECTURE §5).
export async function returnToBlurting(userId: string, cycleId: string) {
  const cycle = await loadOwnedOpenCycle(userId, cycleId);
  if (cycle.etat !== "bilan") throw new WrongCycleStateError("Aucun bilan disponible.");

  await plannerService.refile("etude", cycle.sectionId);
  await db.update(studyCycle).set({ closedAt: new Date(), etat: "clos" }).where(eq(studyCycle.id, cycleId));
  return { ok: true as const };
}

// validateSection (FUNCTIONS §3 S4 ; PLAN Bloc 6.2 + 7.2, REVAMP v2 2026-07-15
// rupture E ; fusion Machine B/C 2026-07-15, DECISIONS.md) : décision utilisateur
// → section `validee`/`en_revision`, cycle refermé. Feynman obligatoire pour
// toute importance 2 à 5, `etat: bilan` requis. Bilan insuffisant ⇒ confirmation
// explicite journalisée `validation_sur_insuffisant` (inchangé — seul le garde
// sur le verdict de *blurting* a disparu avec REVAMP v2, pas celui du *bilan*).
// **Auto-note FSRS désormais obligatoire pour clore** (remplace `rateRevision`,
// supprimée) : `S6.createOrRate` crée la ReviewCard si c'est la 1ʳᵉ validation de
// la section, sinon note l'existante (historique FSRS — stability/difficulty/
// lapses — jamais réinitialisé) ; un seul chemin, quelle que soit la Nᵉ fois.
// `Again` ⇒ re-file intra-journée (assumé malgré le coût désormais plus élevé
// d'un cycle complet à rejouer) ; le mécanisme v1 « 2 Again consécutifs ⇒ retour
// prete » disparaît — il n'existait que pour retomber sur une version allégée
// du cycle (Machine C), qui n'existe plus.
export async function validateSection(userId: string, cycleId: string, note: Note, override = false) {
  const cycle = await loadOwnedOpenCycle(userId, cycleId);
  const sec = await db.query.section.findFirst({ where: eq(section.id, cycle.sectionId) });
  if (!sec) throw new SectionNotReadyError();

  if (cycle.etat !== "bilan") {
    throw new WrongCycleStateError("Le bilan Feynman est requis pour valider la section.");
  }
  const bilan = cycle.bilanFeynman as FeynmanBilan | null;
  if (!bilan) throw new WrongCycleStateError("Aucun bilan Feynman disponible.");
  if (bilan.verdict !== "acquis") {
    if (!override) {
      throw new WrongCycleStateError("Bilan insuffisant : confirmation explicite requise pour valider.");
    }
    await auditService.logEvent("validation_sur_insuffisant", "study_cycle", cycleId);
  }

  await db.update(section).set({ statut: "validee" }).where(eq(section.id, cycle.sectionId));
  await reviewService.createOrRate(userId, cycle.sectionId, note);
  await db.update(section).set({ statut: "en_revision" }).where(eq(section.id, cycle.sectionId));

  if (note === "again") {
    await plannerService.refile(cycle.type, cycle.sectionId);
  }

  await db.update(studyCycle).set({ closedAt: new Date(), etat: "clos" }).where(eq(studyCycle.id, cycleId));
  return { ok: true as const };
}

// transcribe (FUNCTIONS §3 S4 « feynman » : transcript édité ; PLAN Bloc 7.1) :
// audio → transcript, étape intermédiaire avant l'envoi d'un tour Feynman
// (S4.feynman n'existe pas avant le Bloc 7.2 — pas de garde sur un état dédié
// du cycle, cette transition machine B n'existe pas encore). Audio jamais
// persisté : transite en base64, rien n'est écrit en base ici.
export async function transcribe(userId: string, cycleId: string, audioBase64: string, audioFormat: string) {
  const cycle = await loadOwnedOpenCycle(userId, cycleId);
  const sec = await db.query.section.findFirst({ where: eq(section.id, cycle.sectionId) });
  if (!sec) throw new SectionNotReadyError();

  const segmentsGras = (sec.segmentsGras as EmphasisSegment[] | null) ?? [];
  const context = buildTranscriptionContext({ section: { titre: sec.titre, segmentsGras } });

  return transcribeAudio(context, audioBase64, audioFormat);
}
