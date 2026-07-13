"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

  return (
    <div className="flex flex-col gap-6">
      <form action={rythmeAction} className="flex flex-col gap-2 rounded border p-4">
        <Label htmlFor="nouvellesParJour">Nouvelles études par jour</Label>
        <div className="flex items-center gap-3">
          <Input
            id="nouvellesParJour"
            name="nouvellesParJour"
            type="number"
            min={1}
            max={10}
            defaultValue={nouvellesParJour}
            className="w-24"
          />
          <Button type="submit" size="sm" disabled={rythmePending}>
            {rythmePending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
        {rythmeState?.error && <p className="text-sm text-destructive">{rythmeState.error}</p>}
      </form>

      <form action={methodoAction} className="flex flex-col gap-2 rounded border p-4">
        <Label htmlFor="methodologieTitresGlobale">Méthodologie des titres (globale)</Label>
        <Textarea
          id="methodologieTitresGlobale"
          name="methodologieTitresGlobale"
          rows={6}
          defaultValue={methodologieGlobale ?? ""}
          placeholder="Les surcharges par matière se gèrent sur la fiche de chaque matière."
        />
        <Button type="submit" size="sm" disabled={methodoPending} className="self-start">
          {methodoPending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {methodoState?.error && <p className="text-sm text-destructive">{methodoState.error}</p>}
      </form>

      <div className="flex items-center justify-between rounded border p-4">
        <div>
          <p className="text-sm font-medium">Lecture audio (TTS) en Feynman</p>
          <p className="text-sm text-muted-foreground">Réglage par défaut, changeable à tout moment.</p>
        </div>
        <form action={updateTtsActiveAction.bind(null, !ttsActive)}>
          <Button type="submit" size="sm" variant="outline">
            {ttsActive ? "🔊 Activée" : "🔇 Désactivée"}
          </Button>
        </form>
      </div>

      <div className="flex items-center justify-between rounded border p-4">
        <div>
          <p className="text-sm font-medium">Export des données</p>
          <p className="text-sm text-muted-foreground">JSON complet — archives et journaux compris.</p>
        </div>
        <Button size="sm" variant="outline" nativeButton={false} render={<a href="/api/export" />}>
          Télécharger
        </Button>
      </div>

      <div className="rounded border p-4">
        <p className="mb-2 text-sm font-medium">Modèle par appel LLM</p>
        <ul className="flex flex-col gap-1 text-sm">
          {modeles.map(({ appel, modele }) => (
            <li key={appel} className="flex items-center justify-between">
              <span className="text-muted-foreground">{APPEL_LABEL[appel]}</span>
              <span className="font-mono text-xs">{modele}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
