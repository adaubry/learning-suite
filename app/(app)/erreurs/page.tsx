import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { section } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { listSubjects } from "@/services/account";
import * as errorService from "@/services/error";
import { ErrorNotebook, type NotebookFilters } from "@/components/error-notebook";
import type { ErreurType } from "@/core/correction/verdict";
import { resolveErrorAction, reopenErrorAction, editErrorAction, deleteErrorAction } from "./actions";

const ERREUR_TYPES = ["omission", "deformation", "confusion", "imprecision"] as const;
const PAGE_SIZE = 20;

// P5 É5.1 — U24 ErrorNotebook (FUNCTIONS §6.2). Filtres portés par les query
// params (liens, aucun JS requis).
export default async function ErreursPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const userId = await requireUserId();
  const params = await searchParams;

  const filters: NotebookFilters = {
    subjectId: params.subject,
    statut: params.statut === "resolue" ? "resolue" : "active",
    type: ERREUR_TYPES.includes(params.type as (typeof ERREUR_TYPES)[number])
      ? (params.type as ErreurType)
      : undefined,
  };

  const isUnfiltered = !filters.subjectId && !filters.type && filters.statut === "active";
  const page = Math.max(1, Number(params.page) || 1);

  // +1 au-delà de la page : détecte s'il reste une page suivante sans requête COUNT séparée.
  const [subjects, page1Errors] = await Promise.all([
    listSubjects(userId),
    errorService.list(userId, { ...filters, limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE }),
  ]);
  const hasNextPage = page1Errors.length > PAGE_SIZE;
  const errors = page1Errors.slice(0, PAGE_SIZE);

  const sectionIds = [...new Set(errors.map((e) => e.sectionId))];
  const sections = sectionIds.length
    ? await db.query.section.findMany({ where: inArray(section.id, sectionIds), columns: { id: true, titre: true } })
    : [];
  const sectionTitreById = new Map(sections.map((s) => [s.id, s.titre]));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-semibold">Carnet d&apos;erreurs</h1>
      <ErrorNotebook
        subjects={subjects}
        filters={filters}
        isUnfiltered={isUnfiltered && page === 1 && errors.length === 0}
        entries={errors.map((e) => ({ ...e, sectionTitre: sectionTitreById.get(e.sectionId) ?? "Section supprimée" }))}
        page={page}
        hasNextPage={hasNextPage}
        resolveAction={resolveErrorAction}
        reopenAction={reopenErrorAction}
        editAction={editErrorAction}
        deleteAction={deleteErrorAction}
      />
    </div>
  );
}
