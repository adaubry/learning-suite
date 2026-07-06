"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MarkdownViewer } from "@/components/markdown-viewer";
import type { ControlPoint } from "@/llm/schemas/guide";

// U14 RubricEditor (FUNCTIONS §6.2, USER_FLOW É1.5) : points groupés par type,
// édition/suppression/ajout, section en vis-à-vis (U3 MarkdownViewer).
// L'édition est locale (useState) ; seule la soumission ("Valider la
// rubrique") persiste — S3.validate est le seul point qui écrit en base et
// garde l'invariant §7 (≥ 1 point critique).

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
}: {
  sectionTitre: string;
  sectionContenu: string;
  initialPoints: ControlPoint[];
  action: (prevState: unknown, formData: FormData) => Promise<{ error?: string } | undefined>;
}) {
  const [points, setPoints] = useState<ControlPoint[]>(initialPoints);
  const [state, formAction, pending] = useActionState(action, undefined);

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
    <div className="grid grid-cols-2 gap-6">
      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="points" value={JSON.stringify(points)} />
        {typeOrder.map((type) => (
          <div key={type} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{typeLabel[type]}</h3>
              <Button type="button" size="sm" variant="outline" onClick={() => add(type)}>
                Ajouter un point
              </Button>
            </div>
            {points.every((p) => p.type !== type) && (
              <p className="text-sm text-muted-foreground">
                Aucun point {typeLabel[type].toLowerCase()}.
              </p>
            )}
            {points.map((p, i) =>
              p.type === type ? (
                <div key={i} className="flex flex-col gap-2 rounded border p-3">
                  <Label htmlFor={`intitule-${i}`}>Intitulé</Label>
                  <Input
                    id={`intitule-${i}`}
                    value={p.intitule}
                    onChange={(e) => update(i, { intitule: e.target.value })}
                  />
                  <Label htmlFor={`attendu-${i}`}>Attendu</Label>
                  <Textarea
                    id={`attendu-${i}`}
                    value={p.attendu}
                    onChange={(e) => update(i, { attendu: e.target.value })}
                    rows={2}
                  />
                  <Label htmlFor={`piege-${i}`}>Piège associé (optionnel)</Label>
                  <Input
                    id={`piege-${i}`}
                    value={p.piege_associe ?? ""}
                    onChange={(e) => update(i, { piege_associe: e.target.value || null })}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="self-end"
                    onClick={() => remove(i)}
                  >
                    Supprimer
                  </Button>
                </div>
              ) : null,
            )}
          </div>
        ))}
        <Button type="submit" disabled={pending}>
          {pending ? "Validation…" : "Valider la rubrique"}
        </Button>
        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      </form>
      <div className="max-h-[80vh] overflow-y-auto rounded border p-4">
        <h3 className="mb-2 text-sm font-semibold">{sectionTitre}</h3>
        <MarkdownViewer markdown={sectionContenu} />
      </div>
    </div>
  );
}
