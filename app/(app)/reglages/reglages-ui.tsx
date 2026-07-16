"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import type { AppelLLM } from "@/llm/models";
import {
  updatePlannerConfigAction,
  updateMethodologieGlobaleAction,
  updateTtsActiveAction,
} from "../actions";

const APPEL_LABEL: Record<AppelLLM, string> = {
  sectionnement: "Sectionnement (L1)",
  rubrique: "Rubrique (L2)",
  correction_erreurs: "Correction + erreurs (L3)",
  feynman: "Feynman (L4/L5)",
  transcription: "Transcription (L6)",
};

export function ReglagesForm({
  nouvellesParJour,
  ttsActive,
  methodologieGlobale,
  modeles,
}: {
  nouvellesParJour: number;
  ttsActive: boolean;
  methodologieGlobale: string | null;
  modeles: { appel: AppelLLM; modele: string }[];
}) {
  const [rythmeState, rythmeAction, rythmePending] = useActionState(updatePlannerConfigAction, undefined);
  const [methodoState, methodoAction, methodoPending] = useActionState(
    updateMethodologieGlobaleAction,
    undefined,
  );
  const [rythme, setRythme] = useState(nouvellesParJour);
  const [methodo, setMethodo] = useState(methodologieGlobale ?? "");
  const [rythmeJustSaved, setRythmeJustSaved] = useState(false);
  const [methodoJustSaved, setMethodoJustSaved] = useState(false);

  // Dérivation pendant le rendu (pas dans un effet) : React sanctionne ce
  // pattern pour réagir à un changement de state sans le round-trip effet→re-render.
  const [prevRythmeState, setPrevRythmeState] = useState(rythmeState);
  if (rythmeState !== prevRythmeState) {
    setPrevRythmeState(rythmeState);
    if (rythmeState?.success) setRythmeJustSaved(true);
  }
  const [prevMethodoState, setPrevMethodoState] = useState(methodoState);
  if (methodoState !== prevMethodoState) {
    setPrevMethodoState(methodoState);
    if (methodoState?.success) setMethodoJustSaved(true);
  }

  useEffect(() => {
    if (!rythmeJustSaved) return;
    const id = setTimeout(() => setRythmeJustSaved(false), 2000);
    return () => clearTimeout(id);
  }, [rythmeJustSaved]);

  useEffect(() => {
    if (!methodoJustSaved) return;
    const id = setTimeout(() => setMethodoJustSaved(false), 2000);
    return () => clearTimeout(id);
  }, [methodoJustSaved]);

  return (
    <div className="flex flex-col gap-6">
      <form action={rythmeAction} className="flex flex-col gap-2 rounded-none border border-border p-4">
        <div className="flex items-center gap-3">
          <NumberInput
            label="Nouvelles études par jour"
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

      <form action={methodoAction} className="flex flex-col gap-2 rounded-none border border-border p-4">
        <TextArea
          label="Méthodologie des titres (globale)"
          description="Cette méthodologie s'applique à toutes tes futures corrections."
          htmlName="methodologieTitresGlobale"
          rows={6}
          value={methodo}
          onChange={setMethodo}
          placeholder="Les surcharges par matière se gèrent sur la fiche de chaque matière."
        />
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" label={methodoPending ? "Enregistrement…" : "Enregistrer"} isDisabled={methodoPending} />
          {methodoJustSaved && <span className="text-sm text-success">Enregistré ✓</span>}
        </div>
        {methodoState?.error && <p className="text-sm text-error">{methodoState.error}</p>}
      </form>

      <div className="flex items-center justify-between rounded-none border border-border p-4">
        <div>
          <p className="text-sm font-medium">Lecture audio (TTS) en Feynman</p>
          <p className="text-sm text-secondary">Réglage par défaut, changeable à tout moment.</p>
        </div>
        <form action={updateTtsActiveAction.bind(null, !ttsActive)}>
          <Button type="submit" size="sm" variant="secondary" label={ttsActive ? "🔊 Activée" : "🔇 Désactivée"} />
        </form>
      </div>

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
