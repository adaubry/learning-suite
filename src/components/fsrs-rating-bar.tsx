"use client";

import { Button } from "@astryxdesign/core/Button";
import type { Note } from "@/core/fsrs/fsrsCore";

// U18 FsrsRatingBar (FUNCTIONS §6.2, USER_FLOW É3.5) — Again/Hard/Good/Easy avec
// échéance prévisionnelle sous chaque bouton (S6.preview → P9.previewIntervals) ;
// verdict affiché à côté, explicitement non contraignant (ADR 3 : c'est l'auto-
// note, pas le verdict, qui pilote FSRS). Depuis la fusion Machine B/C
// (2026-07-15) : posé sur le bilan Feynman, condition nécessaire à la clôture
// de TOUT cycle (plus seulement de la révision) — compose U21.
//
// Composant CONTRÔLÉ (`disabled`/`onSubmit` fournis par le parent, pas de
// verrou interne) : depuis la fusion, ce n'est plus le seul groupe de boutons
// de son écran (U21 en a d'autres à côté) — le verrou de soumission doit être
// partagé avec ses frères, pas local à ce composant seul (même classe
// d'incident que correction-view.tsx si chacun gérait le sien).

const NOTES: Note[] = ["again", "hard", "good", "easy"];
const LABELS: Record<Note, string> = { again: "Again", hard: "Hard", good: "Good", easy: "Easy" };

function formatEcheance(dueIso: string, todayIso: string): string {
  const days = Math.round((Date.parse(dueIso) - Date.parse(todayIso)) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "demain";
  return `dans ~${days} j`;
}

export function FsrsRatingBar({
  verdict,
  preview,
  rateAction,
  disabled = false,
  onSubmit,
}: {
  verdict: "acquis" | "insuffisant";
  preview: Record<Note, { due: string }>;
  rateAction: (note: Note, formData: FormData) => Promise<void>;
  disabled?: boolean;
  onSubmit?: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-secondary">
        Verdict proposé (aide, non contraignant) : <strong>{verdict}</strong>
      </p>
      <div className="flex flex-wrap gap-2">
        {NOTES.map((note) => (
          <form key={note} action={rateAction.bind(null, note)} onSubmit={onSubmit}>
            <Button
              type="submit"
              label={LABELS[note]}
              variant={note === "again" ? "destructive" : "secondary"}
              className="h-auto flex-col gap-0.5 py-2"
              isDisabled={disabled}
            >
              <span>{LABELS[note]}</span>
              <span className="text-xs font-normal text-secondary">
                {formatEcheance(preview[note].due, today)}
              </span>
            </Button>
          </form>
        ))}
      </div>
    </div>
  );
}
