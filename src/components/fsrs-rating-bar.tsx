"use client";

import { Button } from "@/components/ui/button";
import type { Note } from "@/core/fsrs/fsrsCore";

// U18 FsrsRatingBar (FUNCTIONS §6.2, USER_FLOW É4.2) — Again/Hard/Good/Easy avec
// échéance prévisionnelle sous chaque bouton (S6.preview → P9.previewIntervals) ;
// verdict LLM affiché à côté, explicitement non contraignant (ARCHITECTURE §6 :
// c'est l'auto-note, pas le verdict, qui pilote FSRS — ADR 3).

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
  rejectedIndexesField,
  rateAction,
}: {
  verdict: "acquis" | "insuffisant";
  preview: Record<Note, { due: string }>;
  rejectedIndexesField: string;
  rateAction: (note: Note, formData: FormData) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        Verdict proposé (aide, non contraignant) : <strong>{verdict}</strong>
      </p>
      <div className="flex flex-wrap gap-2">
        {NOTES.map((note) => (
          <form key={note} action={rateAction.bind(null, note)}>
            <input type="hidden" name="rejectedIndexes" value={rejectedIndexesField} />
            <Button type="submit" variant={note === "again" ? "outline" : "secondary"} className="h-auto flex-col gap-0.5 py-2">
              <span>{LABELS[note]}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {formatEcheance(preview[note].due, today)}
              </span>
            </Button>
          </form>
        ))}
      </div>
    </div>
  );
}
