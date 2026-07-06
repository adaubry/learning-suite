import { eq } from "drizzle-orm";
import { db } from "@/db";
import { chapter, subject, section } from "@/db/schema";
import { parseChapter } from "@/core/parser/parseChapter";
import { validateDocument, anomalyKey } from "@/core/parser/validateDocument";
import { computeContentHash } from "@/core/parser/contentHash";
import * as audit from "./audit";

// S1 · ChapterService — partiel (FUNCTIONS §3) : seul le point d'entrée `import`
// (É1.2) existe à ce bloc. simulateUpdate/commitUpdate/archive/delete viendront
// avec le versionnage (PLAN.md Phase 8).

export function analyzeMarkdown(markdown: string) {
  const parsed = parseChapter(markdown);
  const anomalies = validateDocument(parsed, markdown);
  return { parsed, anomalies };
}

export class AnomaliesNonAcquitteesError extends Error {
  constructor() {
    super("Anomalies non acquittées : import refusé.");
  }
}

export async function importChapter(
  userId: string,
  input: { subjectId: string; titre: string; markdown: string; acknowledgedAnomalyKeys: string[] },
) {
  const owned = await db.query.subject.findFirst({
    where: eq(subject.id, input.subjectId),
  });
  if (!owned || owned.userId !== userId) {
    throw new Error("Matière introuvable.");
  }

  // Ne jamais faire confiance à l'acquittement envoyé par le client : on
  // recalcule les anomalies depuis le markdown brut (S1 possède le refus).
  const { anomalies } = analyzeMarkdown(input.markdown);
  const acknowledged = new Set(input.acknowledgedAnomalyKeys);
  const unacknowledged = anomalies.filter((a) => !acknowledged.has(anomalyKey(a)));
  if (unacknowledged.length > 0) {
    throw new AnomaliesNonAcquitteesError();
  }

  const contentHash = computeContentHash(input.markdown);

  const [created] = await db
    .insert(chapter)
    .values({
      subjectId: input.subjectId,
      titre: input.titre,
      markdown: input.markdown,
      version: 1,
      contentHash,
    })
    .returning();

  await Promise.all(
    anomalies.map(() => audit.logEvent("acquittement_anomalie", "chapter", created.id)),
  );

  return created;
}

export async function listChaptersBySubject(subjectId: string) {
  return db.query.chapter.findMany({
    where: eq(chapter.subjectId, subjectId),
    orderBy: (c, { desc }) => [desc(c.maj)],
  });
}

export async function listSectionsByChapter(chapterId: string) {
  return db.query.section.findMany({
    where: eq(section.chapterId, chapterId),
    orderBy: (s, { asc }) => [asc(s.ordre)],
  });
}
