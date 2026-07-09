import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { chapter, subject, section, correctionGuide } from "@/db/schema";
import { parseChapter } from "@/core/parser/parseChapter";
import { validateDocument, anomalyKey } from "@/core/parser/validateDocument";
import { computeContentHash } from "@/core/parser/contentHash";
import { selectCandidateHeadings } from "@/core/sectioning/candidateHeadings";
import { matchSections, type OldSection } from "@/core/matching/matchSections";
import { diffChapterVersions, type DiffSegment } from "@/core/diff/diffChapterVersions";
import { extractSection, assertChapterOwnership } from "./section";
import * as reviewService from "./review";
import * as audit from "./audit";

// S1 · ChapterService (FUNCTIONS §3). `import` (É1.2) depuis le Bloc 2.2 ;
// `simulateUpdate`/`commitUpdate` (PLAN.md Bloc 8.2, ARCHITECTURE §7) — pipeline
// unique partagé par É6.2 (éditeur intégré, Bloc 8.3) et É6.3 (ré-import, Bloc
// 8.4). `archive`/`delete` restent hors scope (Bloc 9.1).

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

async function loadNonArchivedSections(chapterId: string) {
  return db.query.section.findMany({
    where: and(eq(section.chapterId, chapterId), ne(section.statut, "archivee")),
  });
}

function toOldSection(sec: { id: string; titre: string; ordre: number; contenu: string }): OldSection {
  return { id: sec.id, titre: sec.titre, ordre: sec.ordre, contenu: sec.contenu };
}

export interface UpdateSimulation {
  changed: boolean;
  versionActuelle: number;
  versionSuivante: number;
  intactes: number;
  rubriquesInvalidees: number;
  nouvelles: number;
  archivees: number;
  diff: DiffSegment[];
}

// simulateUpdate (ARCHITECTURE §7, API en deux temps — FUNCTIONS §7 « jamais de commit sans
// simulation ») : lecture seule, ne persiste rien. Recalculée intégralement à `commitUpdate`
// plutôt que de faire confiance à un aller-retour client, même doctrine que `importChapter`
// avec les anomalies.
export async function simulateUpdate(
  userId: string,
  chapterId: string,
  nouveauMarkdown: string,
): Promise<UpdateSimulation> {
  const { chap } = await assertChapterOwnership(chapterId, userId);
  const nouveauHash = computeContentHash(nouveauMarkdown);

  if (nouveauHash === chap.contentHash) {
    return {
      changed: false,
      versionActuelle: chap.version,
      versionSuivante: chap.version,
      intactes: 0,
      rubriquesInvalidees: 0,
      nouvelles: 0,
      archivees: 0,
      diff: [],
    };
  }

  const ancienSections = await loadNonArchivedSections(chapterId);
  const { titleTree: nouveauTree } = parseChapter(nouveauMarkdown);
  const match = matchSections(ancienSections.map(toOldSection), nouveauTree, nouveauMarkdown);
  const diff = diffChapterVersions(
    chap.markdown,
    parseChapter(chap.markdown).titleTree,
    nouveauMarkdown,
    nouveauTree,
  );

  return {
    changed: true,
    versionActuelle: chap.version,
    versionSuivante: chap.version + 1,
    intactes: match.appariements.filter((m) => m.statut === "intacte").length,
    rubriquesInvalidees: match.appariements.filter((m) => m.statut === "modifiee").length,
    nouvelles: match.nouvelles.length,
    archivees: match.disparues.length,
    diff,
  };
}

type OrdreEntry =
  | { kind: "match"; statut: "intacte" | "modifiee"; sectionId: string; start: number; titre: string; contenuBloc: { start: number; end: number } }
  | { kind: "nouvelle"; start: number; titre: string; contenuBloc: { start: number; end: number } };

// commitUpdate (ARCHITECTURE §7) : version++, cascade transactionnelle. StudySession et
// ErrorEntry ne sont JAMAIS touchées (aucune référence à ces tables ci-dessous) — leur
// immuabilité tient au simple fait qu'aucune requête ne les cible.
export async function commitUpdate(userId: string, chapterId: string, nouveauMarkdown: string) {
  const { chap } = await assertChapterOwnership(chapterId, userId);
  const nouveauHash = computeContentHash(nouveauMarkdown);
  if (nouveauHash === chap.contentHash) return { changed: false as const };

  const ancienSections = await loadNonArchivedSections(chapterId);
  const { titleTree, boldSegments, italicSegments } = parseChapter(nouveauMarkdown);
  const niveauSource = selectCandidateHeadings(titleTree)[0]?.level ?? 0;
  const match = matchSections(ancienSections.map(toOldSection), titleTree, nouveauMarkdown);
  const versionSuivante = chap.version + 1;

  // Ordre du document final : appariements + nouvelles, triés par position dans le nouveau
  // markdown — les 3 passes de P4 ne garantissent un ordre que dans leur propre groupe, pas
  // globalement. Tranché en récitation (Bloc 8.2) : l'ordre suit toujours le document, même
  // pour les sections intactes (sinon il dérive silencieusement à chaque ré-import).
  const ordreEntries: OrdreEntry[] = [
    ...match.appariements.map((m): OrdreEntry => ({
      kind: "match",
      statut: m.statut,
      sectionId: m.ancienneId,
      start: m.nouveauBloc.start,
      titre: m.nouveauBloc.titre,
      contenuBloc: m.nouveauBloc,
    })),
    ...match.nouvelles.map((b): OrdreEntry => ({
      kind: "nouvelle",
      start: b.start,
      titre: b.titre,
      contenuBloc: b,
    })),
  ].sort((a, b) => a.start - b.start);

  await db.transaction(async (tx) => {
    await tx
      .update(chapter)
      .set({ markdown: nouveauMarkdown, version: versionSuivante, contentHash: nouveauHash, maj: new Date() })
      .where(eq(chapter.id, chapterId));

    for (const [i, entry] of ordreEntries.entries()) {
      const ordre = i + 1;
      const extracted = extractSection(nouveauMarkdown, boldSegments, italicSegments, entry.contenuBloc.start, entry.contenuBloc.end);

      if (entry.kind === "nouvelle") {
        await tx.insert(section).values({
          chapterId,
          chapterVersion: versionSuivante,
          titre: entry.titre,
          ordre,
          niveauSource,
          importance: 3, // "3 présélectionné" (USER_FLOW É1.4), même défaut que S2.propose
          statut: "a_trier",
          ...extracted,
        });
        continue;
      }

      if (entry.statut === "intacte") {
        // Seuls ordre et chapterVersion bougent — contenu/titre/statut/rubrique/ReviewCard
        // conservés à la lettre (ARCHITECTURE §7).
        await tx
          .update(section)
          .set({ ordre, chapterVersion: versionSuivante })
          .where(eq(section.id, entry.sectionId));
        continue;
      }

      // modifiee : contenu neuf, statut conservé, rubrique existante invalidée (obsolete) —
      // son chapterVersion à elle n'est PAS touché, elle reste ancrée à l'ancienne version
      // (signal exploité par S5.attentionBadges pour distinguer une invalidation par cascade
      // d'une régénération manuelle S3.regenerate, qui recrée une rubrique non-obsolète aussitôt).
      await tx
        .update(section)
        .set({ ordre, chapterVersion: versionSuivante, titre: entry.titre, niveauSource, ...extracted })
        .where(eq(section.id, entry.sectionId));
      await tx
        .update(correctionGuide)
        .set({ statut: "obsolete" })
        .where(and(eq(correctionGuide.sectionId, entry.sectionId), ne(correctionGuide.statut, "obsolete")));
    }

    for (const d of match.disparues) {
      await tx.update(section).set({ statut: "archivee" }).where(eq(section.id, d.ancienneId));
    }
  });

  // Gel des ReviewCards hors transaction : S6 est le seul propriétaire du gel (FUNCTIONS §7)
  // et n'expose pas de variante tx-aware — même façon de composer que S4.validateSection
  // appelant S6.createCard sans envelopper l'appel dans sa propre transaction. Idempotent,
  // sans effet de bord si aucune ReviewCard n'existe encore pour la section.
  for (const d of match.disparues) {
    await reviewService.freeze(userId, d.ancienneId);
  }

  return { changed: true as const, version: versionSuivante };
}
