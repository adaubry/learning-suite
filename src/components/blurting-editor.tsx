"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

// U15 BlurtingEditor (FUNCTIONS §6.2, USER_FLOW É3.1) — zone plein écran, chrono
// discret, Markdown accepté. Garantie « aucun accès au cours » tenue par
// composition : ce composant ne reçoit JAMAIS le contenu du chapitre en props,
// seulement un titre. Étude ET révision (USER_FLOW É4.1 : même composant).
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
  /** USER_FLOW É4.1 : badge « Révision — Xᵉ rappel » (X = ReviewCard.reps + 1). */
  rappelNumero?: number;
  action: (prevState: unknown, formData: FormData) => Promise<{ error?: string } | undefined>;
  abandonAction?: () => Promise<void>;
}) {
  const elapsed = useElapsed();
  const [state, formAction, pending] = useActionState(action, undefined);
  const [abandoning, setAbandoning] = useState(false);
  const submitting = pending || abandoning;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">{sectionTitre}</h1>
        <Badge variant="secondary">
          {type === "etude" ? "Étude" : rappelNumero != null ? `Révision — ${rappelNumero}ᵉ rappel` : "Révision"}
        </Badge>
        <Badge variant="outline">tentative n°{tentative}</Badge>
        <span className="ml-auto text-xs text-muted-foreground">{elapsed}</span>
      </div>
      <form action={formAction} className="flex flex-1 flex-col gap-3">
        <Textarea
          name="blurting"
          required
          placeholder="Écris tout ce dont tu te souviens, sans regarder le cours…"
          className="min-h-[50vh] flex-1"
          autoFocus
        />
        <Button type="submit" disabled={submitting} className="self-end">
          {pending ? "Correction…" : "Soumettre"}
        </Button>
        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      </form>
      {abandonAction && (
        <form action={abandonAction} onSubmit={() => setAbandoning(true)}>
          <Button type="submit" variant="ghost" size="sm" disabled={submitting}>
            Abandonner la tentative
          </Button>
        </form>
      )}
    </div>
  );
}
