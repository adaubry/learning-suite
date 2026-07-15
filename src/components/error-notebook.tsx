"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { TextArea } from "@astryxdesign/core/TextArea";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ErreurType } from "@/core/correction/verdict";

const typeLabel: Record<ErreurType, string> = {
  omission: "Omission",
  deformation: "Déformation",
  confusion: "Confusion",
  imprecision: "Imprécision",
};

export interface NotebookEntry {
  id: string;
  sectionId: string;
  sectionTitre: string;
  sessionId: string;
  type: ErreurType;
  description: string;
  statut: "active" | "resolue";
  occurrences: number;
  createdAt: Date;
}

export interface NotebookFilters {
  subjectId?: string;
  statut: "active" | "resolue";
  type?: ErreurType;
}

function filterHref(base: NotebookFilters, patch: Partial<NotebookFilters>) {
  const merged = { ...base, ...patch };
  const params = new URLSearchParams();
  if (merged.subjectId) params.set("subject", merged.subjectId);
  params.set("statut", merged.statut);
  if (merged.type) params.set("type", merged.type);
  return `/erreurs?${params.toString()}`;
}

// U24 ErrorNotebook (FUNCTIONS §6.2, USER_FLOW É5.1). Filtres en liens (query
// params, aucun JS requis) ; édition en <details> natif (TECH_MAPPING §4 —
// pas de composant client pour un simple repli/dépli) ; suppression via U8
// ConfirmDialog (confirmation légère, pas de dépendants sur une ErrorEntry).
export function ErrorNotebook({
  subjects,
  entries,
  filters,
  resolveAction,
  editAction,
  deleteAction,
}: {
  subjects: { id: string; nom: string }[];
  entries: NotebookEntry[];
  filters: NotebookFilters;
  resolveAction: (errorId: string) => Promise<void>;
  editAction: (errorId: string, formData: FormData) => Promise<void>;
  deleteAction: (errorId: string) => Promise<void>;
}) {
  // Résoudre/éditer/supprimer mutent la MÊME ErrorEntry — verrou par ligne (pas
  // global : les autres lignes sont des entités indépendantes, pas de raison de
  // les bloquer). Même classe de bug que correction-view.tsx, ici avec plusieurs
  // entités en liste plutôt qu'un seul écran.
  const [submittingIds, setSubmittingIds] = useState<Set<string>>(new Set());
  const lock = (id: string) => setSubmittingIds((prev) => new Set(prev).add(id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        <Link
          href={filterHref(filters, { subjectId: undefined })}
          className={`text-sm ${!filters.subjectId ? "font-semibold underline" : "text-secondary"}`}
        >
          Toutes les matières
        </Link>
        {subjects.map((s) => (
          <Link
            key={s.id}
            href={filterHref(filters, { subjectId: s.id })}
            className={`text-sm ${filters.subjectId === s.id ? "font-semibold underline" : "text-secondary"}`}
          >
            {s.nom}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-2">
          {(["active", "resolue"] as const).map((statut) => (
            <Button
              key={statut}
              size="sm"
              variant={filters.statut === statut ? "primary" : "secondary"}
              label={statut === "active" ? "Actives" : "Résolues"}
              href={filterHref(filters, { statut })}
              as={Link}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant={!filters.type ? "secondary" : "ghost"}
            label="Tous types"
            href={filterHref(filters, { type: undefined })}
            as={Link}
          />
          {(Object.keys(typeLabel) as ErreurType[]).map((type) => (
            <Button
              key={type}
              size="sm"
              variant={filters.type === type ? "secondary" : "ghost"}
              label={typeLabel[type]}
              href={filterHref(filters, { type })}
              as={Link}
            />
          ))}
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-secondary">
          Aucune erreur {filters.statut === "active" ? "active" : "résolue"}
          {filters.subjectId ? " pour cette matière" : ""}.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-2 rounded border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="neutral" label={typeLabel[e.type]} />
                {e.occurrences > 1 && <Badge variant="neutral" label={`récidive ×${e.occurrences}`} />}
                <Link href={`/section/${e.sectionId}/rubrique`} className="text-sm underline">
                  {e.sectionTitre}
                </Link>
                <span className="text-xs text-secondary">{e.createdAt.toLocaleDateString("fr-FR")}</span>
              </div>

              <p className="text-sm">{e.description}</p>

              <div className="flex flex-wrap items-center gap-2">
                {e.statut === "active" && (
                  <form action={resolveAction.bind(null, e.id)} onSubmit={() => lock(e.id)}>
                    <Button type="submit" size="sm" variant="secondary" isDisabled={submittingIds.has(e.id)} label="Marquer résolue" />
                  </form>
                )}
                <details className="text-sm">
                  <summary className="cursor-pointer select-none text-secondary">Éditer</summary>
                  <EditEntryForm
                    description={e.description}
                    action={editAction.bind(null, e.id)}
                    onSubmit={() => lock(e.id)}
                    disabled={submittingIds.has(e.id)}
                  />
                </details>
                <ConfirmDialog
                  trigger={<Button size="sm" variant="ghost" isDisabled={submittingIds.has(e.id)} label="Supprimer" />}
                  title="Supprimer cette erreur ?"
                  description="À utiliser si elle a été créée à tort — cette action est irréversible."
                  action={deleteAction.bind(null, e.id)}
                  onConfirm={() => lock(e.id)}
                />
                <Link href={`/session/${e.sessionId}`} className="text-sm text-secondary underline">
                  Voir la session d&apos;origine
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EditEntryForm({
  description,
  action,
  onSubmit,
  disabled,
}: {
  description: string;
  action: (formData: FormData) => Promise<void>;
  onSubmit: () => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState(description);
  return (
    <form action={action} onSubmit={onSubmit} className="mt-2 flex flex-col gap-2">
      <TextArea label="Description" isLabelHidden htmlName="description" value={value} onChange={setValue} rows={2} />
      <Button type="submit" size="sm" className="self-start" isDisabled={disabled} label="Enregistrer" />
    </form>
  );
}
