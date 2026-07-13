"use client";

import { useActionState, useState } from "react";
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

  return (
    <div className="flex flex-col gap-6">
      <form action={rythmeAction} className="flex flex-col gap-2 rounded border border-border p-4">
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
        </div>
        {rythmeState?.error && <p className="text-sm text-error">{rythmeState.error}</p>}
      </form>

      <form action={methodoAction} className="flex flex-col gap-2 rounded border border-border p-4">
        <TextArea
          label="Méthodologie des titres (globale)"
          htmlName="methodologieTitresGlobale"
          rows={6}
          value={methodo}
          onChange={setMethodo}
          placeholder="Les surcharges par matière se gèrent sur la fiche de chaque matière."
        />
        <Button type="submit" size="sm" className="self-start" label={methodoPending ? "Enregistrement…" : "Enregistrer"} isDisabled={methodoPending} />
        {methodoState?.error && <p className="text-sm text-error">{methodoState.error}</p>}
      </form>

      <div className="flex items-center justify-between rounded border border-border p-4">
        <div>
          <p className="text-sm font-medium">Lecture audio (TTS) en Feynman</p>
          <p className="text-sm text-secondary">Réglage par défaut, changeable à tout moment.</p>
        </div>
        <form action={updateTtsActiveAction.bind(null, !ttsActive)}>
          <Button type="submit" size="sm" variant="secondary" label={ttsActive ? "🔊 Activée" : "🔇 Désactivée"} />
        </form>
      </div>

      <div className="flex items-center justify-between rounded border border-border p-4">
        <div>
          <p className="text-sm font-medium">Export des données</p>
          <p className="text-sm text-secondary">JSON complet — archives et journaux compris.</p>
        </div>
        <Button size="sm" variant="secondary" label="Télécharger" href="/api/export" />
      </div>

      <div className="rounded border border-border p-4">
        <p className="mb-2 text-sm font-medium">Modèle par appel LLM</p>
        <ul className="flex flex-col gap-1 text-sm">
          {modeles.map(({ appel, modele }) => (
            <li key={appel} className="flex items-center justify-between">
              <span className="text-secondary">{APPEL_LABEL[appel]}</span>
              <span className="font-mono text-xs">{modele}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
