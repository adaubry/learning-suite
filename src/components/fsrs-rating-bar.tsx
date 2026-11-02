"use client";

import { Button } from "@astryxdesign/core/Button";
import type { Note } from "@/core/fsrs/fsrsCore";

// FsrsRatingBar — auto-note de fin de session, échéance prévue sous chaque bouton
// (preview FSRS). C'est cette note, jamais le verdict, qui pilote FSRS. Après une
// relecture, seules Again/Hard sont proposées (`notes`).
//
// Composant CONTRÔLÉ (`disabled`/`onSubmit` fournis par le parent) : il partage
// son écran avec d'autres boutons de sortie, le verrou de soumission doit être commun.

const LABELS: Record<Note, string> = { again: "Again", hard: "Hard", good: "Good", easy: "Easy" };

function formatEcheance(dueIso: string, todayIso: string): string {
  const days = Math.round((Date.parse(dueIso) - Date.parse(todayIso)) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "demain";
  return `dans ~${days} j`;
}

export function FsrsRatingBar({
  notes,
  preview,
  rateAction,
  hiddenFields = {},
  disabled = false,
  onSubmit,
}: {
  notes: Note[];
  preview: Record<Note, { due: string }>;
  rateAction: (note: Note, formData: FormData) => Promise<void>;
  /** Champs cachés envoyés avec la note (ex. erreurs candidates rejetées). */
  hiddenFields?: Record<string, string>;
  disabled?: boolean;
  onSubmit?: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-wrap gap-2">
      {notes.map((note) => (
        <form key={note} action={rateAction.bind(null, note)} onSubmit={onSubmit}>
          {Object.entries(hiddenFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <Button
            type="submit"
            label={LABELS[note]}
            variant={note === "again" ? "destructive" : "secondary"}
            className="h-auto flex-col gap-0.5 py-2"
            isDisabled={disabled}
          >
            <span>{LABELS[note]}</span>
            <span className="text-xs font-normal text-secondary">{formatEcheance(preview[note].due, today)}</span>
          </Button>
        </form>
      ))}
    </div>
  );
}
