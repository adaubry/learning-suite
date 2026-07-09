import { and, eq, gt, ne } from "drizzle-orm";
import { db } from "@/db";
import { correctionGuide, section, chapter, subject } from "@/db/schema";
import { buildRubriqueContext } from "@/llm/context/rubrique";
import { generateGuide } from "@/llm/generateGuide";
import { guideOutputSchema } from "@/llm/schemas/guide";
import * as errorService from "./error";
import * as accountService from "./account";
import { joursAvantExamen, compareOrdreCurriculum } from "@/core/planner/buildDailyQueue";
import type { EmphasisSegment } from "@/core/parser/types";

// S3 · GuideService — rubriques (FUNCTIONS §3, §7). `lazyScheduler` (Bloc 6.4)
// remplace la génération purement manuelle de Bloc 4.1, conservée pour l'option
// « générer la rubrique » du chapitre (`generateBatch`).

export class SectionNotActiveError extends Error {
  constructor() {
    super("La rubrique ne peut être générée que pour une section active.");
  }
}

export class NoGuideToRegenerateError extends Error {
  constructor() {
    super("Aucune rubrique existante à régénérer pour cette section.");
  }
}

export class InvalidGuideEditError extends Error {}

// Un seul propriétaire de vérification (FUNCTIONS §7) : chaque point d'entrée
// remonte à la matière pour confirmer que l'utilisateur la possède, comme
// ChapterService.importChapter.
export async function assertSectionOwnership(sectionId: string, userId: string) {
  const sec = await db.query.section.findFirst({ where: eq(section.id, sectionId) });
  if (!sec) throw new Error("Section introuvable.");

  const chap = await db.query.chapter.findFirst({ where: eq(chapter.id, sec.chapterId) });
  if (!chap) throw new Error("Section introuvable.");

  const subj = await db.query.subject.findFirst({ where: eq(subject.id, chap.subjectId) });
  if (!subj || subj.userId !== userId) throw new Error("Section introuvable.");

  return sec;
}

async function loadGuideOwned(guideId: string, userId: string) {
  const guide = await db.query.correctionGuide.findFirst({ where: eq(correctionGuide.id, guideId) });
  if (!guide) throw new Error("Rubrique introuvable.");
  await assertSectionOwnership(guide.sectionId, userId);
  return guide;
}

async function loadSectionContext(sectionId: string, userId: string) {
  const sec = await assertSectionOwnership(sectionId, userId);

  const chap = await db.query.chapter.findFirst({ where: eq(chapter.id, sec.chapterId) });
  if (!chap) throw new Error("Chapitre introuvable.");

  const subj = await db.query.subject.findFirst({ where: eq(subject.id, chap.subjectId) });
  if (!subj) throw new Error("Matière introuvable.");

  const erreursActives = await errorService.activeFor(subj.id);
  const segmentsGras = (sec.segmentsGras as EmphasisSegment[] | null) ?? [];
  const commentaires = (sec.commentaires as EmphasisSegment[] | null) ?? [];

  return {
    sec,
    context: buildRubriqueContext({
      section: { titre: sec.titre, contenu: sec.contenu, segmentsGras, commentaires },
      matiere: subj.nom,
      chapitre: chap.titre,
      erreursActives,
    }),
  };
}

// Lecture pour l'écran U14 (section/[id]/rubrique) : la rubrique non-obsolète
// de la section, quel que soit son statut (a_valider ou valide).
export async function getForSection(userId: string, sectionId: string) {
  const sec = await assertSectionOwnership(sectionId, userId);
  const existingGuide = await db.query.correctionGuide.findFirst({
    where: and(eq(correctionGuide.sectionId, sectionId), ne(correctionGuide.statut, "obsolete")),
  });
  return { section: sec, guide: existingGuide ?? null };
}

export async function generate(userId: string, sectionId: string) {
  const { sec, context } = await loadSectionContext(sectionId, userId);
  if (sec.statut !== "active") throw new SectionNotActiveError();

  const output = await generateGuide(context);
  const [created] = await db
    .insert(correctionGuide)
    .values({ sectionId, chapterVersion: sec.chapterVersion, contenu: output })
    .returning();

  await db.update(section).set({ statut: "rubrique_a_valider" }).where(eq(section.id, sectionId));
  return created;
}

// Rédaction manuelle (USER_FLOW É1.5, secours si le LLM échoue) : rubrique
// vide, remplie point par point dans U14 puis soumise à `validate`, qui
// applique le même garde-fou (≥ 1 point critique) qu'une rubrique générée.
export async function createManual(userId: string, sectionId: string) {
  const sec = await assertSectionOwnership(sectionId, userId);
  if (sec.statut !== "active") throw new SectionNotActiveError();

  const [created] = await db
    .insert(correctionGuide)
    .values({ sectionId, chapterVersion: sec.chapterVersion, contenu: { points: [] } })
    .returning();

  await db.update(section).set({ statut: "rubrique_a_valider" }).where(eq(section.id, sectionId));
  return created;
}

// Valide la rubrique avec les points tels qu'édités dans U14 : seul point où
// la section devient `prete`, donc seul endroit où le garde-fou §7 (≥ 1 point
// critique) doit être vérifié, quelle que soit l'origine des points (LLM ou
// rédaction manuelle).
export async function validate(userId: string, guideId: string, points: unknown) {
  const guide = await loadGuideOwned(guideId, userId);
  if (guide.statut !== "a_valider") throw new Error("Rubrique déjà validée ou obsolète.");

  const parsed = guideOutputSchema.safeParse({ points });
  if (!parsed.success) {
    throw new InvalidGuideEditError(parsed.error.issues[0]?.message ?? "Rubrique invalide.");
  }

  const [updated] = await db
    .update(correctionGuide)
    .set({ contenu: parsed.data, statut: "valide", valideLe: new Date() })
    .where(eq(correctionGuide.id, guideId))
    .returning();

  await db.update(section).set({ statut: "prete" }).where(eq(section.id, guide.sectionId));
  return updated;
}

export async function regenerate(userId: string, sectionId: string) {
  // le partial unique index (correction_guide_section_non_obsolete) garantit
  // qu'au plus une ligne non-obsolète existe par section — ce filtre la trouve
  // de façon déterministe, sans dépendre de l'ordre naturel de la table.
  await assertSectionOwnership(sectionId, userId);
  const existing = await db.query.correctionGuide.findFirst({
    where: and(eq(correctionGuide.sectionId, sectionId), ne(correctionGuide.statut, "obsolete")),
  });
  if (!existing) throw new NoGuideToRegenerateError();

  return db.transaction(async (tx) => {
    await tx
      .update(correctionGuide)
      .set({ statut: "obsolete" })
      .where(eq(correctionGuide.id, existing.id));

    const { context } = await loadSectionContext(sectionId, userId);
    const output = await generateGuide(context);

    const [created] = await tx
      .insert(correctionGuide)
      .values({ sectionId, chapterVersion: existing.chapterVersion, contenu: output })
      .returning();

    await tx.update(section).set({ statut: "rubrique_a_valider" }).where(eq(section.id, sectionId));
    return created;
  });
}

// Un seul appelant en échec ne doit pas empêcher les autres (bouton manuel de
// chapitre ET lazyScheduler) — partagé par generateBatch et lazyScheduler.
async function generateMany(userId: string, sectionIds: string[]) {
  const results = await Promise.allSettled(sectionIds.map((id) => generate(userId, id)));
  return results.map((r, i) =>
    r.status === "fulfilled"
      ? { sectionId: sectionIds[i], ok: true as const, guide: r.value }
      : { sectionId: sectionIds[i], ok: false as const, error: String(r.reason) },
  );
}

// lazyScheduler (FUNCTIONS §3 S3 ; ARCHITECTURE §3/§4 : LLM 2 « à l'approche de
// la tête de file » ; PLAN Bloc 6.4) — tâche de fond + hook de S5.todayQueue.
// Pré-génère la rubrique des sections `active` (jamais de rubrique encore,
// Machine A) dans la limite de config.nouvellesParJour (même plafond que les
// nouvelles études du jour — fenêtre tranchée avec l'humain en récitation),
// triées comme S5 (importance DESC, proximité d'examen, ordre curriculum).
// Jamais d'avance pour l'importance 2 (secondaire, étudiée en dernier) : exclue
// du tri, reste uniquement accessible via le bouton manuel (`generate`/
// `generateBatch`).
export async function lazyScheduler(userId: string, date: string = new Date().toISOString().slice(0, 10)) {
  const config = await accountService.getPlannerConfig(userId);

  const rows = await db
    .select({
      sectionId: section.id,
      importance: section.importance,
      subjectOrdre: subject.ordre,
      chapterMaj: chapter.maj,
      sectionOrdre: section.ordre,
      dateExamen: subject.dateExamen,
    })
    .from(section)
    .innerJoin(chapter, eq(section.chapterId, chapter.id))
    .innerJoin(subject, eq(chapter.subjectId, subject.id))
    .where(
      and(
        eq(subject.userId, userId),
        eq(subject.statut, "active"),
        eq(section.statut, "active"),
        gt(section.importance, 2),
      ),
    );

  const candidates = rows
    .map((r) => ({ ...r, joursAvantExamen: joursAvantExamen(date, r.dateExamen) }))
    .sort(
      (a, b) =>
        b.importance - a.importance ||
        (a.joursAvantExamen ?? Infinity) - (b.joursAvantExamen ?? Infinity) ||
        compareOrdreCurriculum(a, b),
    )
    .slice(0, Math.max(0, config.nouvellesParJour));

  return generateMany(userId, candidates.map((c) => c.sectionId));
}

export async function generateBatch(userId: string, chapterId: string) {
  const chap = await db.query.chapter.findFirst({ where: eq(chapter.id, chapterId) });
  if (!chap) throw new Error("Chapitre introuvable.");
  const subj = await db.query.subject.findFirst({ where: eq(subject.id, chap.subjectId) });
  if (!subj || subj.userId !== userId) throw new Error("Chapitre introuvable.");

  const active = await db.query.section.findMany({
    where: and(eq(section.chapterId, chapterId), eq(section.statut, "active")),
  });

  return generateMany(userId, active.map((s) => s.id));
}
