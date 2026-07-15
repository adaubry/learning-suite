"use client";

import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { MarkdownViewer } from "@/components/markdown-viewer";
import { DiffList } from "@/components/correction-view";
import type { MergedDiffPoint } from "@/core/correction/verdict";

// U25 LectureView (FUNCTIONS §6.2, USER_FLOW É3.1, REVAMP v2 2026-07-15) —
// nouvel écran de Machine B : la lecture du cours devient une étape de l'app,
// deux occurrences par cycle (initiale avant blurting_1, ciblée avant
// blurting_2). Structurel, pas de minuteur (§2.6 REVAMP.md) : rien ne
// chronomètre, mais le bouton de blurting n'est atteignable que depuis cet
// écran (S4.terminerLecture, seule transition lecture→blurting).
//
// `[Abandonner]` vit ici pour la même raison qu'en blurting-editor.tsx : verrou
// de soumission partagé, les deux mutent le même StudyCycle.

export function LectureView({
  sectionTitre,
  contenu,
  diff,
  action,
  abandonAction,
}: {
  sectionTitre: string;
  contenu: string;
  /** Relecture ciblée (2ᵉ passe) : diff de la correction précédente en vis-à-vis
   *  (§2.7 REVAMP.md, déjà en divulgation complète). Absent en lecture initiale. */
  diff?: MergedDiffPoint[];
  action: () => Promise<void>;
  abandonAction: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const lockSubmit = () => setSubmitting(true);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">{sectionTitre}</h1>
        <Badge variant="neutral" label={diff ? "Relecture ciblée" : "Lecture"} />
      </div>

      <div className={diff ? "grid flex-1 grid-cols-1 gap-4 md:grid-cols-2" : "flex flex-1 flex-col"}>
        <div className="overflow-y-auto">
          <MarkdownViewer markdown={contenu} />
        </div>
        {diff && (
          <div className="overflow-y-auto">
            <DiffList diff={diff} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <form action={action} onSubmit={lockSubmit}>
          <Button type="submit" isDisabled={submitting} label="Je suis prêt, je blurte" />
        </form>
        <form action={abandonAction} onSubmit={lockSubmit}>
          <Button type="submit" variant="ghost" size="sm" isDisabled={submitting} label="Abandonner" />
        </form>
      </div>
    </div>
  );
}
