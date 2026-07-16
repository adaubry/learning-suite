"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Badge } from "@astryxdesign/core/Badge";

// U15 BlurtingEditor (FUNCTIONS §6.2, USER_FLOW É3.2) — zone plein écran, chrono
// discret, Markdown accepté. Garantie « aucun accès au cours » tenue par
// composition : ce composant ne reçoit JAMAIS le contenu du chapitre en props,
// seulement un titre. Étude ET révision (USER_FLOW É3.2 : même composant).
//
// Instruction adaptée à la tentative en étude (REVAMP v2, 2026-07-15) : n°1 =
// grandes lignes (après lecture_1), n°2 = détail (après relecture ciblée).
//
// « Abandonner » vit ICI (pas en sibling dans page.tsx) pour partager le verrou
// de soumission : les deux mutent le même StudyCycle (soumettre → correction,
// abandonner → clos) — sans verrou commun, cliquer les deux en succession
// rapide peut abandonner un cycle dont la correction vient de démarrer, ou
// inversement (même classe de bug que correction-view.tsx).

function useElapsed() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function BlurtingEditor({
  sectionTitre,
  tentative,
  type = "etude",
  rappelNumero,
  action,
  abandonAction,
}: {
  sectionTitre: string;
  tentative: number;
  type?: "etude" | "revision";
  /** USER_FLOW É3.2 : badge « Révision — Xᵉ rappel » (X = ReviewCard.reps + 1). */
  rappelNumero?: number;
  action: (
    prevState: unknown,
    formData: FormData,
  ) => Promise<{ error?: string } | undefined>;
  abandonAction?: () => Promise<void>;
}) {
  const elapsed = useElapsed();
  const [state, formAction, pending] = useActionState(action, undefined);
  const [abandoning, setAbandoning] = useState(false);
  const submitting = pending || abandoning;
  const [blurting, setBlurting] = useState("");

  const instruction =
    type === "etude"
      ? tentative === 1
        ? "Écris les grandes lignes, comme un plan — sans regarder le cours…"
        : "Développe maintenant en détail, à partir de ta relecture — sans regarder le cours…"
      : "Écris tout ce dont tu te souviens, sans regarder le cours…";

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">{sectionTitre}</h1>
        <Badge
          variant="neutral"
          label={
            type === "etude"
              ? "Étude"
              : rappelNumero != null
                ? `Révision — ${rappelNumero}ᵉ rappel`
                : "Révision"
          }
        />
        <Badge variant="neutral" label={`tentative n°${tentative}`} />
        <span className="ml-auto text-xs text-secondary">{elapsed}</span>
      </div>
      <form action={formAction} className="flex flex-1 flex-col gap-3">
        <TextArea
          label="Restitution"
          isLabelHidden
          htmlName="blurting"
          isRequired
          value={blurting}
          onChange={setBlurting}
          placeholder={instruction}
          className="min-h-[50vh] flex-1"
          hasAutoFocus
        />
        <Button
          type="submit"
          className="self-end"
          isDisabled={submitting}
          label={pending ? "Correction…" : "Soumettre"}
        />
        {state?.error && <p className="text-sm text-error">{state.error}</p>}
      </form>
      {abandonAction && (
        <form action={abandonAction} onSubmit={() => setAbandoning(true)}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            isDisabled={submitting}
            label="Abandonner la tentative"
          />
        </form>
      )}
    </div>
  );
}
