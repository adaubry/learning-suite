import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { correctionGuide, section, chapter, subject } from "@/db/schema";
import { buildRubriqueContext } from "@/llm/context/rubrique";
import { generateGuide } from "@/llm/generateGuide";
import * as errorService from "./error";
import type { EmphasisSegment } from "@/core/parser/types";

// S3 · GuideService — rubriques (FUNCTIONS §3, §7). Bouton manuel ce bloc ; le
// lazyScheduler (génération à l'approche de la file) attend le Planificateur (Phase 6).

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

async function loadSectionContext(sectionId: string) {
  const sec = await db.query.section.findFirst({ where: eq(section.id, sectionId) });
  if (!sec) throw new Error("Section introuvable.");

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

export async function generate(sectionId: string) {
  const { sec, context } = await loadSectionContext(sectionId);
  if (sec.statut !== "active") throw new SectionNotActiveError();

  const output = await generateGuide(context);
  const [created] = await db
    .insert(correctionGuide)
    .values({ sectionId, chapterVersion: sec.chapterVersion, contenu: output })
    .returning();

  await db.update(section).set({ statut: "rubrique_a_valider" }).where(eq(section.id, sectionId));
  return created;
}

export async function validate(guideId: string) {
  const guide = await db.query.correctionGuide.findFirst({ where: eq(correctionGuide.id, guideId) });
  if (!guide) throw new Error("Rubrique introuvable.");

  const [updated] = await db
    .update(correctionGuide)
    .set({ statut: "valide", valideLe: new Date() })
    .where(eq(correctionGuide.id, guideId))
    .returning();

  await db.update(section).set({ statut: "prete" }).where(eq(section.id, guide.sectionId));
  return updated;
}

export async function regenerate(sectionId: string) {
  // le partial unique index (correction_guide_section_non_obsolete) garantit
  // qu'au plus une ligne non-obsolète existe par section — ce filtre la trouve
  // de façon déterministe, sans dépendre de l'ordre naturel de la table.
  const existing = await db.query.correctionGuide.findFirst({
    where: and(eq(correctionGuide.sectionId, sectionId), ne(correctionGuide.statut, "obsolete")),
  });
  if (!existing) throw new NoGuideToRegenerateError();

  return db.transaction(async (tx) => {
    await tx
      .update(correctionGuide)
      .set({ statut: "obsolete" })
      .where(eq(correctionGuide.id, existing.id));

    const { context } = await loadSectionContext(sectionId);
    const output = await generateGuide(context);

    const [created] = await tx
      .insert(correctionGuide)
      .values({ sectionId, chapterVersion: existing.chapterVersion, contenu: output })
      .returning();

    await tx.update(section).set({ statut: "rubrique_a_valider" }).where(eq(section.id, sectionId));
    return created;
  });
}

export async function generateBatch(chapterId: string) {
  const active = await db.query.section.findMany({
    where: and(eq(section.chapterId, chapterId), eq(section.statut, "active")),
  });

  const results = await Promise.allSettled(active.map((s) => generate(s.id)));

  return results.map((r, i) =>
    r.status === "fulfilled"
      ? { sectionId: active[i].id, ok: true as const, guide: r.value }
      : { sectionId: active[i].id, ok: false as const, error: String(r.reason) },
  );
}
