"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import type { TriageOperation } from "@/services/section.schemas";

// U13 TriageList/TriageRow (FUNCTIONS §6.2, USER_FLOW É1.4) — titre éditable inline,
// importance 1..5 (3 présélectionné), fusion avec la précédente, scission au point de
// coupe, aperçu dépliable. Pas de réordonnancement (TECH_MAPPING v0.3 — l'ordre suit
// les bornes du document, DECISIONS.md bloc 3.3).

export interface TriageSectionInput {
  id: string;
  titre: string;
  importance: number;
  contenu: string;
}

type Row =
  | { key: string; kind: "keep"; sourceId: string; titre: string; importance: number; contenu: string }
  | {
      key: string;
      kind: "merge";
      sourceIds: [string, string];
      titre: string;
      importance: number;
      contenu: string;
    }
  | {
      key: string;
      kind: "split";
      sourceId: string;
      half: 0 | 1;
      cutOffset: number;
      titre: string;
      importance: number;
      contenu: string;
    };

// splitRow insère toujours les deux moitiés adjacentes (half=1 juste après half=0)
// et rien ne réordonne les rows avant la soumission : pas besoin de rechercher la paire.
function toOperations(rows: Row[]): TriageOperation[] {
  const ops: TriageOperation[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.kind === "keep") {
      ops.push({ kind: "keep", sectionId: r.sourceId, titre: r.titre, importance: r.importance });
    } else if (r.kind === "merge") {
      ops.push({ kind: "merge", sectionIds: r.sourceIds, titre: r.titre, importance: r.importance });
    } else {
      const pair = rows[++i] as Extract<Row, { kind: "split" }>;
      ops.push({
        kind: "split",
        sectionId: r.sourceId,
        cutOffset: r.cutOffset,
        titres: [r.titre, pair.titre],
        importances: [r.importance, pair.importance],
      });
    }
  }
  return ops;
}

function ImportanceSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Importance">
      {[1, 2, 3, 4, 5].map((n) => (
        <Button
          key={n}
          type="button"
          size="sm"
          variant={value === n ? "primary" : "secondary"}
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          label={String(n)}
          tooltip={n === 1 ? "Hors programme" : n === 5 ? "Très important" : undefined}
        />
      ))}
    </div>
  );
}

function SplitPicker({ contenu, onSplit }: { contenu: string; onSplit: (cutOffset: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  if (!open) {
    return <Button type="button" variant="secondary" size="sm" label="Scinder" onClick={() => setOpen(true)} />;
  }

  return (
    <div className="flex flex-col gap-2 rounded-none border border-border p-2">
      <p className="text-xs text-secondary">Clique dans le texte au point de coupe souhaité.</p>
      <TextArea
        ref={ref}
        label="Contenu"
        isLabelHidden
        value={contenu}
        onChange={() => {}}
        rows={6}
        className="font-mono text-xs"
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          label="Scinder ici"
          onClick={() => {
            const cut = ref.current?.selectionStart ?? 0;
            if (cut > 0 && cut < contenu.length) onSplit(cut);
            setOpen(false);
          }}
        />
        <Button type="button" variant="secondary" size="sm" label="Annuler" onClick={() => setOpen(false)} />
      </div>
    </div>
  );
}

function TriageRow({
  row,
  canMerge,
  onRename,
  onImportance,
  onMerge,
  onSplit,
}: {
  row: Row;
  canMerge: boolean;
  onRename: (titre: string) => void;
  onImportance: (n: number) => void;
  onMerge: () => void;
  onSplit: (cutOffset: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="flex flex-col gap-2 rounded-none border border-border p-3">
      <div className="flex flex-wrap items-center gap-3">
        <TextInput
          label="Titre de la section"
          isLabelHidden
          value={row.titre}
          onChange={onRename}
          className="min-w-48 flex-1"
        />
        <ImportanceSelector value={row.importance} onChange={onImportance} />
        <Button type="button" variant="secondary" size="sm" label={expanded ? "Masquer l'aperçu" : "Aperçu"} onClick={() => setExpanded((v) => !v)} />
        {row.kind === "keep" && (
          <>
            <Button type="button" variant="secondary" size="sm" isDisabled={!canMerge} label="Fusionner avec la précédente" onClick={onMerge} />
            <SplitPicker contenu={row.contenu} onSplit={onSplit} />
          </>
        )}
      </div>
      {expanded && (
        <div className="max-h-40 overflow-y-auto rounded-none bg-muted p-2 text-xs whitespace-pre-wrap">
          {row.contenu}
        </div>
      )}
    </li>
  );
}

export function TriageList({
  chapterId,
  sections,
  action,
}: {
  chapterId: string;
  sections: TriageSectionInput[];
  action: (prevState: unknown, formData: FormData) => Promise<{ error?: string } | undefined>;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    sections.map((s) => ({
      key: s.id,
      kind: "keep",
      sourceId: s.id,
      titre: s.titre,
      importance: s.importance,
      contenu: s.contenu,
    })),
  );
  const [state, formAction, pending] = useActionState(action, undefined);

  const exclues = rows.filter((r) => r.importance === 1).length;

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? ({ ...r, ...patch } as Row) : r)));
  }

  function mergeWithPrevious(index: number) {
    setRows((prev) => {
      const a = prev[index - 1];
      const b = prev[index];
      if (a.kind !== "keep" || b.kind !== "keep") return prev;
      const merged: Row = {
        key: `merge-${a.sourceId}-${b.sourceId}`,
        kind: "merge",
        sourceIds: [a.sourceId, b.sourceId],
        titre: `${a.titre} — ${b.titre}`,
        importance: Math.max(a.importance, b.importance),
        contenu: `${a.contenu}\n\n${b.contenu}`,
      };
      return [...prev.slice(0, index - 1), merged, ...prev.slice(index + 1)];
    });
  }

  function splitRow(index: number, cutOffset: number) {
    setRows((prev) => {
      const r = prev[index];
      if (r.kind !== "keep") return prev;
      const before: Row = {
        key: `split-${r.sourceId}-0`,
        kind: "split",
        sourceId: r.sourceId,
        half: 0,
        cutOffset,
        titre: `${r.titre} (1)`,
        importance: r.importance,
        contenu: r.contenu.slice(0, cutOffset),
      };
      const after: Row = {
        key: `split-${r.sourceId}-1`,
        kind: "split",
        sourceId: r.sourceId,
        half: 1,
        cutOffset,
        titre: `${r.titre} (2)`,
        importance: r.importance,
        contenu: r.contenu.slice(cutOffset),
      };
      return [...prev.slice(0, index), before, after, ...prev.slice(index + 1)];
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="chapterId" value={chapterId} />
      <input type="hidden" name="operations" value={JSON.stringify(toOperations(rows))} />

      <div className="flex items-center justify-between text-sm text-secondary">
        <span>
          {rows.length} sections · {exclues} exclues (importance 1)
        </span>
      </div>

      <ul className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <TriageRow
            key={row.key}
            row={row}
            canMerge={i > 0 && row.kind === "keep" && rows[i - 1].kind === "keep"}
            onRename={(titre) => updateRow(row.key, { titre })}
            onImportance={(importance) => updateRow(row.key, { importance })}
            onMerge={() => mergeWithPrevious(i)}
            onSplit={(cutOffset) => splitRow(i, cutOffset)}
          />
        ))}
      </ul>

      {state?.error && <p className="text-sm text-error">{state.error}</p>}
      <Button type="submit" isDisabled={pending} className="self-start" label={pending ? "Enregistrement…" : "Terminer le tri"} />
    </form>
  );
}
