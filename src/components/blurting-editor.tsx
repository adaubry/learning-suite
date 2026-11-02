"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Badge } from "@astryxdesign/core/Badge";

// BlurtingEditor (USER_FLOW.md v2) — zone plein écran, chrono discret.
// Garantie « aucun accès à la fiche » tenue par composition : ce composant ne
// reçoit JAMAIS le contenu de la fiche en props, seulement son titre.
//
// « Abandonner » vit ICI (pas en sibling dans page.tsx) pour partager le verrou
// de soumission : les deux mutent le même StudyCycle (soumettre → correction,
// abandonner → clos) — sans verrou commun, cliquer les deux en succession
// rapide peut abandonner un cycle dont la correction vient de démarrer.

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
  ficheTitre,
  tentative,
  type = "etude",
  rappelNumero,
  action,
  abandonAction,
}: {
  ficheTitre: string;
  tentative: number;
  type?: "etude" | "revision";
  /** Badge « Révision — Xᵉ rappel » (X = ReviewCard.reps + 1). */
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
    tentative === 2
      ? "Après ta relecture : réécris tout ce que tu sais de la fiche, sans la regarder…"
      : type === "revision"
        ? "Rappel à froid : écris tout ce dont tu te souviens de cette fiche…"
        : "Écris tout ce que tu as retenu de la fiche, sans la regarder…";

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">{ficheTitre}</h1>
        <Badge
          variant="neutral"
          label={
            type === "etude"
              ? "Nouvelle"
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
          // La hauteur va sur le <textarea> lui-même : sur le wrapper Astryx,
          // le champ gardait ses 3 lignes par défaut dans une boîte plus grande.
          className="flex-1 [&_textarea]:min-h-[60vh]"
          hasAutoFocus
        />
        <Button
          type="submit"
          className="self-end"
          isDisabled={submitting}
          label={pending ? "Enregistrement…" : "Comparer avec la fiche"}
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
