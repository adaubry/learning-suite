"use client";

import { Button } from "@/components/ui/button";

// USER_FLOW règle 1/7 : aucun appel LLM ne bloque définitivement un parcours —
// mécanisme natif (`error.tsx`, ARCHITECTURE §10) plutôt qu'un état d'erreur
// reconstruit à la main dans chaque écran du cycle d'étude.

export default function FocusError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-destructive">
        Une erreur est survenue. Ta restitution, si tu en avais soumis une, est déjà sauvegardée.
      </p>
      <Button size="sm" onClick={reset}>
        Réessayer
      </Button>
    </div>
  );
}
