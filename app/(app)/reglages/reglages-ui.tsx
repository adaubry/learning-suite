"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import type { AppelLLM } from "@/llm/models";
import { updatePlannerConfigAction } from "../actions";

const APPEL_LABEL: Record<AppelLLM, string> = {
  correction_erreurs: "Correction des blurtings",
};

export function ReglagesForm({
  nouvellesParJour,
  modeles,
}: {
  nouvellesParJour: number;
  modeles: { appel: AppelLLM; modele: string }[];
}) {
  const [rythmeState, rythmeAction, rythmePending] = useActionState(updatePlannerConfigAction, undefined);
  const [rythme, setRythme] = useState(nouvellesParJour);
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
        <div className="flex items-center gap-3">
          <NumberInput
            label="Nouvelles fiches par jour"
            htmlName="nouvellesParJour"
            min={1}
            max={10}
            value={rythme}
            onChange={setRythme}
          />
          <Button type="submit" size="sm" label={rythmePending ? "Enregistrement…" : "Enregistrer"} isDisabled={rythmePending} />
          {rythmeJustSaved && <span className="text-sm text-success">Enregistré ✓</span>}
        </div>
        {rythmeState?.error && <p className="text-sm text-error">{rythmeState.error}</p>}
      </form>

      <div className="flex items-center justify-between rounded-none border border-border p-4">
        <div>
          <p className="text-sm font-medium">Export des données</p>
          <p className="text-sm text-secondary">JSON complet — archives et journaux compris.</p>
        </div>
        <Button size="sm" variant="secondary" label="Télécharger" href="/api/export" />
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-secondary">Zone technique — lecture seule</p>
        <div className="rounded-none border border-border bg-muted p-4">
          <p className="mb-2 text-sm font-medium">Modèle par appel LLM</p>
          <ul className="flex flex-col gap-1 text-sm">
            {modeles.map(({ appel, modele }) => {
              const nonConfigure = modele === "(non configuré)";
              return (
                <li key={appel} className="flex items-center justify-between">
                  <span className="text-secondary">{APPEL_LABEL[appel]}</span>
                  <span className={nonConfigure ? "text-xs font-mono text-error" : "font-mono text-xs"}>{modele}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
