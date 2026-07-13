"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { MarkdownViewer } from "@/components/markdown-viewer";
import type { ControlPoint } from "@/llm/schemas/guide";

// U14 RubricEditor (FUNCTIONS §6.2, USER_FLOW É1.5) : points groupés par type,
// édition/suppression/ajout, section en vis-à-vis (U3 MarkdownViewer).
// L'édition est locale (useState) ; seule la soumission ("Valider la
// rubrique") persiste — S3.validate est le seul point qui écrit en base et
// garde l'invariant §7 (≥ 1 point critique).
//
// « Relancer (nouvelle génération) » vit ICI (pas en sibling dans page.tsx) pour
// partager le même verrou que « Valider » : les deux mutent la même rubrique
// (S3.regenerate obsolète la ligne que S3.validate vient peut-être de valider) —
// sans verrou commun, un double-clic valider+relancer revalide silencieusement
// dans le désordre, sans erreur visible (constaté en usage sur un autre écran,
// même classe de bug que correction-view.tsx).

const typeOrder: ControlPoint["type"][] = ["critique", "important", "secondaire"];
const typeLabel: Record<ControlPoint["type"], string> = {
  critique: "Critique",
  important: "Important",
  secondaire: "Secondaire",
};

function emptyPoint(type: ControlPoint["type"]): ControlPoint {
  return { type, intitule: "", attendu: "", piege_associe: null, segments_couverts: [] };
}

export function RubricEditor({
  sectionTitre,
  sectionContenu,
  initialPoints,
  action,
  regenerateAction,
}: {
  sectionTitre: string;
  sectionContenu: string;
  initialPoints: ControlPoint[];
  action: (prevState: unknown, formData: FormData) => Promise<{ error?: string } | undefined>;
  regenerateAction?: (prevState: unknown, formData: FormData) => Promise<{ error?: string } | undefined>;
}) {
  const [points, setPoints] = useState<ControlPoint[]>(initialPoints);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [regenerateState, regenerateFormAction, regenerating] = useActionState(
    regenerateAction ?? (async () => undefined),
    undefined,
  );
  const submitting = pending || regenerating;
  const formRef = useRef<HTMLFormElement>(null);

  function update(i: number, patch: Partial<ControlPoint>) {
    setPoints((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }
  function remove(i: number) {
    setPoints((ps) => ps.filter((_, j) => j !== i));
  }
  function add(type: ControlPoint["type"]) {
    setPoints((ps) => [...ps, emptyPoint(type)]);
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <form ref={formRef} action={formAction} className="flex flex-col gap-5">
        {regenerateAction && (
          <div className="flex flex-col items-end gap-1">
            {regenerateState?.error && (
              <p className="text-sm text-error">
                {regenerateState.error} — la rédaction manuelle ci-dessous reste disponible.
              </p>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              isDisabled={submitting}
              label="Relancer (nouvelle génération)"
              onClick={() => {
                if (formRef.current) startTransition(() => regenerateFormAction(new FormData(formRef.current!)));
              }}
            />
          </div>
        )}
        <input type="hidden" name="points" value={JSON.stringify(points)} />
        {typeOrder.map((type) => (
          <div key={type} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{typeLabel[type]}</h3>
              <Button type="button" size="sm" variant="secondary" label="Ajouter un point" onClick={() => add(type)} />
            </div>
            {points.every((p) => p.type !== type) && (
              <p className="text-sm text-secondary">
                Aucun point {typeLabel[type].toLowerCase()}.
              </p>
            )}
            {points.map((p, i) =>
              p.type === type ? (
                <div key={i} className="flex flex-col gap-2 rounded border border-border p-3">
                  <TextInput label="Intitulé" value={p.intitule} onChange={(v) => update(i, { intitule: v })} />
                  <TextArea label="Attendu" value={p.attendu} onChange={(v) => update(i, { attendu: v })} rows={2} />
                  <TextInput
                    label="Piège associé (optionnel)"
                    isOptional
                    value={p.piege_associe ?? ""}
                    onChange={(v) => update(i, { piege_associe: v || null })}
                  />
                  <Button type="button" size="sm" variant="ghost" className="self-end" label="Supprimer" onClick={() => remove(i)} />
                </div>
              ) : null,
            )}
          </div>
        ))}
        <Button type="submit" isDisabled={submitting} label={pending ? "Validation…" : "Valider la rubrique"} />
        {state?.error && <p className="text-sm text-error">{state.error}</p>}
      </form>
      <div className="max-h-[80vh] overflow-y-auto rounded border border-border p-4">
        <h3 className="mb-2 text-sm font-semibold">{sectionTitre}</h3>
        <MarkdownViewer markdown={sectionContenu} />
      </div>
    </div>
  );
}
