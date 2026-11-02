import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { fiche } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { listSubjects } from "@/services/account";
import * as errorService from "@/services/error";
import { ErrorNotebook, type NotebookFilters } from "@/components/error-notebook";
import type { ErreurType } from "@/core/fiche/verdict";
import { resolveErrorAction, reopenErrorAction, editErrorAction, deleteErrorAction } from "./actions";

const ERREUR_TYPES = ["omission", "deformation", "confusion", "imprecision"] as const;
const PAGE_SIZE = 20;

// Carnet d'erreurs (USER_FLOW.md v2). Filtres portés par les query params.
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

  const ficheIds = [...new Set(errors.map((e) => e.ficheId))];
  const fiches = ficheIds.length
    ? await db.query.fiche.findMany({
        where: inArray(fiche.id, ficheIds),
        columns: { id: true, numero: true, titre: true },
      })
    : [];
  const ficheTitreById = new Map(fiches.map((f) => [f.id, `${f.numero}. ${f.titre}`]));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-semibold">Carnet d&apos;erreurs</h1>
      <ErrorNotebook
        subjects={subjects}
        filters={filters}
        isUnfiltered={isUnfiltered && page === 1 && errors.length === 0}
        entries={errors.map((e) => ({ ...e, ficheTitre: ficheTitreById.get(e.ficheId) ?? "Fiche supprimée" }))}
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
