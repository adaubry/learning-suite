"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { updatePlannerConfigAction } from "../actions";

export function ReglagesForm({
  nouvellesParJour,
}: {
  /** null = aucun plafond. */
  nouvellesParJour: number | null;
}) {
  const [rythmeState, rythmeAction, rythmePending] = useActionState(updatePlannerConfigAction, undefined);
  const [limiter, setLimiter] = useState(nouvellesParJour !== null);
  const [rythme, setRythme] = useState(nouvellesParJour ?? 3);
  const [rythmeJustSaved, setRythmeJustSaved] = useState(false);

  // Dérivation pendant le rendu (pas dans un effet) : React sanctionne ce
  // pattern pour réagir à un changement de state sans le round-trip effet→re-render.
  const [prevRythmeState, setPrevRythmeState] = useState(rythmeState);
  if (rythmeState !== prevRythmeState) {
    setPrevRythmeState(rythmeState);
    if (rythmeState?.success) setRythmeJustSaved(true);
  }

  useEffect(() => {
    if (!rythmeJustSaved) return;
    const id = setTimeout(() => setRythmeJustSaved(false), 2000);
    return () => clearTimeout(id);
  }, [rythmeJustSaved]);

  return (
    <div className="flex flex-col gap-6">
      <form action={rythmeAction} className="flex flex-col gap-2 rounded-none border border-border p-4">
        <CheckboxInput
          label="Limiter les nouvelles fiches par jour"
          description="Décoché : toutes les nouvelles fiches apparaissent dans la file du jour."
          htmlName="limiter"
          value={limiter}
          onChange={setLimiter}
        />
        <div className="flex items-center gap-3">
          {limiter && (
            <NumberInput
              label="Nouvelles fiches par jour"
              htmlName="nouvellesParJour"
              min={1}
              max={50}
              value={rythme}
              onChange={setRythme}
            />
          )}
          <Button type="submit" size="sm" label={rythmePending ? "Enregistrement…" : "Enregistrer"} isDisabled={rythmePending} />
          {rythmeJustSaved && <span className="text-sm text-success">Enregistré ✓</span>}
        </div>
        {rythmeState?.error && <p className="text-sm text-error">{rythmeState.error}</p>}
      </form>

      <div className="flex items-center justify-between rounded-none border border-border p-4">
        <div>
          <p className="text-sm font-medium">Export des données</p>
          <p className="text-sm text-secondary">JSON complet, archives comprises.</p>
        </div>
        <Button size="sm" variant="secondary" label="Télécharger" href="/api/export" />
      </div>
    </div>
  );
}
