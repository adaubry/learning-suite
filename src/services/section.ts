import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { chapter, section, subject } from "@/db/schema";
import { parseChapter } from "@/core/parser/parseChapter";
import { selectCandidateHeadings } from "@/core/sectioning/candidateHeadings";
import { mechanicalSectioning } from "@/core/sectioning/mechanicalSectioning";
import { proposeSectioning } from "@/llm/proposeSectioning";
import * as account from "./account";
import type { EmphasisSegment } from "@/core/parser/types";
import type { ApplyTriageInput, TriageOperation } from "./section.schemas";

// S2 · SectioningService — partiel (FUNCTIONS §3) : `propose` (É1.3) et `applyTriage`
// (É1.4), le tri initial. `setImportance` (rétrogradation/réintégration à tout moment
// après planification) attend un appelant réel (curriculum, Phase 6+) et le gel/dégel
// via S6, qui n'existe pas encore — non construit ici (DECISIONS.md, bloc 3.3).

// Exporté : réutilisé par S1.simulateUpdate/commitUpdate (Bloc 8.2) — même vérification
// qu'ici, pas de troisième copie.
export async function assertChapterOwnership(chapterId: string, userId: string) {
  const chap = await db.query.chapter.findFirst({ where: eq(chapter.id, chapterId) });
  if (!chap) throw new Error("Chapitre introuvable.");
  const subj = await db.query.subject.findFirst({ where: eq(subject.id, chap.subjectId) });
  if (!subj || subj.userId !== userId) throw new Error("Chapitre introuvable.");
  return { chap, subj };
}

// Section.contenu est un extrait du markdown : les segments gras/italiques (positions
// absolues, issus de P1 sur le chapitre entier) doivent être réancrés sur cet extrait
// pour que U3 les rende correctement. Exporté : réutilisé par S1.commitUpdate (Bloc 8.2),
// même façon d'extraire une section que l'import initial.
export function extractSection(
  markdown: string,
  bold: EmphasisSegment[],
  italic: EmphasisSegment[],
  start: number,
  end: number,
) {
  const within = (segs: EmphasisSegment[]) =>
    segs
      .filter((s) => s.start >= start && s.end <= end)
      .map((s) => ({ ...s, start: s.start - start, end: s.end - start }));
  return {
    contenu: markdown.slice(start, end),
    segmentsGras: within(bold),
    commentaires: within(italic),
  };
}

export async function propose(userId: string, chapterId: string) {
  const { chap, subj } = await assertChapterOwnership(chapterId, userId);

  const { titleTree, boldSegments, italicSegments } = parseChapter(chap.markdown);
  // les candidats sont tous du même niveau (Titre 2, sinon Titre 1) — cf. candidateHeadings.
  const niveauSource = selectCandidateHeadings(titleTree)[0]?.level ?? 0;

  let proposed: { titre: string; start: number; end: number }[];
  let method: "llm" | "mecanique";
  try {
    proposed = await proposeSectioning({
      markdown: chap.markdown,
      titleTree,
      italicSegments,
      matiere: subj.nom,
      chapitre: chap.titre,
      methodologieTitres:
        subj.methodologieTitres ?? (await account.getMethodologieGlobale(userId)) ?? "",
    });
    method = "llm";
  } catch {
    // secours P6 (USER_FLOW règle 1) : échec LLM après retries ou aucun titre
    // exploitable (AucunTitreExploitableError) — jamais bloquant.
    proposed = mechanicalSectioning(titleTree, chap.markdown.length);
    method = "mecanique";
  }

  const rows = proposed.map((s, i) => ({
    chapterId,
    chapterVersion: chap.version,
    titre: s.titre,
    ordre: i + 1,
    niveauSource,
    importance: 3, // "3 présélectionné" (USER_FLOW É1.4)
    statut: "a_trier" as const,
    ...extractSection(chap.markdown, boldSegments, italicSegments, s.start, s.end),
  }));

  // idempotent : un rechargement de l'écran d'attente (ou [Relancer]) ré-appelle
  // `propose` — les a_trier de la tentative précédente n'ont encore aucune
  // dépendance (pas de rubrique, pas d'étude) donc peuvent être remplacés sans
  // perte ; active/exclue/archivee (tri déjà fait) ne sont jamais touchées ici.
  const sections = await db.transaction(async (tx) => {
    await tx
      .delete(section)
      .where(and(eq(section.chapterId, chapterId), eq(section.statut, "a_trier")));
    return tx.insert(section).values(rows).returning();
  });

  return { sections, method };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function shiftSegments(segs: unknown, offset: number): EmphasisSegment[] {
  return ((segs as EmphasisSegment[] | null) ?? []).map((s) => ({
    ...s,
    start: s.start + offset,
    end: s.end + offset,
  }));
}

// Applique une opération et renvoie le prochain `ordre` disponible : "keep"/"merge"
// consomment une position, "split" deux. Rejeu (double soumission) détecté par le
// statut déjà `archivee` des sections sources — l'opération est alors un no-op qui
// avance quand même le compteur, pour ne pas décaler les opérations suivantes.
async function applyOperation(
  tx: Tx,
  chap: { id: string; version: number },
  op: TriageOperation,
  ordre: number,
): Promise<number> {
  if (op.kind === "keep") {
    const sec = await tx.query.section.findFirst({ where: eq(section.id, op.sectionId) });
    if (!sec || sec.chapterId !== chap.id) throw new Error("Section introuvable.");
    if (sec.statut !== "archivee") {
      await tx
        .update(section)
        .set({
          titre: op.titre,
          importance: op.importance,
          statut: op.importance === 1 ? "exclue" : "active",
          ordre,
        })
        .where(eq(section.id, op.sectionId));
    }
    return ordre + 1;
  }

  if (op.kind === "merge") {
    const rows = await tx.query.section.findMany({ where: inArray(section.id, op.sectionIds) });
    if (rows.length !== 2 || rows.some((r) => r.chapterId !== chap.id)) {
      throw new Error("Section introuvable.");
    }
    if (rows.every((r) => r.statut !== "archivee")) {
      const ordered = [...rows].sort((a, b) => a.ordre - b.ordre);
      const contenu = ordered.map((r) => r.contenu).join("\n\n");
      let offset = 0;
      const segmentsGras: EmphasisSegment[] = [];
      const commentaires: EmphasisSegment[] = [];
      for (const r of ordered) {
        segmentsGras.push(...shiftSegments(r.segmentsGras, offset));
        commentaires.push(...shiftSegments(r.commentaires, offset));
        offset += r.contenu.length + 2; // séparateur "\n\n" inséré ci-dessus
      }

      await tx.insert(section).values({
        chapterId: chap.id,
        chapterVersion: chap.version,
        titre: op.titre,
        ordre,
        niveauSource: ordered[0].niveauSource,
        contenu,
        segmentsGras,
        commentaires,
        importance: op.importance,
        statut: op.importance === 1 ? "exclue" : "active",
        parentIds: ordered.map((r) => r.id),
      });
      await tx
        .update(section)
        .set({ statut: "archivee" })
        .where(inArray(section.id, op.sectionIds));
    }
    return ordre + 1;
  }

  // split
  const sec = await tx.query.section.findFirst({ where: eq(section.id, op.sectionId) });
  if (!sec || sec.chapterId !== chap.id) throw new Error("Section introuvable.");
  if (sec.statut !== "archivee") {
    const cut = op.cutOffset;
    const splitAt = (segs: unknown) => {
      const list = (segs as EmphasisSegment[] | null) ?? [];
      const before = list.filter((s) => s.end <= cut);
      const after = list.filter((s) => s.start >= cut).map((s) => ({ ...s, start: s.start - cut, end: s.end - cut }));
      // un segment à cheval sur le point de coupe est ignoré (le point de coupe
      // est choisi par l'utilisateur, USER_FLOW É1.4, entre deux constructions)
      return [before, after] as const;
    };
    const [grasAvant, grasApres] = splitAt(sec.segmentsGras);
    const [comAvant, comApres] = splitAt(sec.commentaires);

    await tx.insert(section).values([
      {
        chapterId: chap.id,
        chapterVersion: chap.version,
        titre: op.titres[0],
        ordre,
        niveauSource: sec.niveauSource,
        contenu: sec.contenu.slice(0, cut),
        segmentsGras: grasAvant,
        commentaires: comAvant,
        importance: op.importances[0],
        statut: op.importances[0] === 1 ? "exclue" : "active",
        parentIds: [sec.id],
      },
      {
        chapterId: chap.id,
        chapterVersion: chap.version,
        titre: op.titres[1],
        ordre: ordre + 1,
        niveauSource: sec.niveauSource,
        contenu: sec.contenu.slice(cut),
        segmentsGras: grasApres,
        commentaires: comApres,
        importance: op.importances[1],
        statut: op.importances[1] === 1 ? "exclue" : "active",
        parentIds: [sec.id],
      },
    ]);
    await tx.update(section).set({ statut: "archivee" }).where(eq(section.id, sec.id));
  }
  return ordre + 2;
}

export async function applyTriage(userId: string, input: ApplyTriageInput) {
  const { chap } = await assertChapterOwnership(input.chapterId, userId);
  await db.transaction(async (tx) => {
    let ordre = 1;
    for (const op of input.operations) {
      ordre = await applyOperation(tx, chap, op, ordre);
    }
  });
}

