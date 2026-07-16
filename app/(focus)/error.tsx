"use client";

import Link from "next/link";
import { Button } from "@astryxdesign/core/Button";
import { FocusShell } from "@/components/focus-shell";

// USER_FLOW règle 1/7 : aucun appel LLM ne bloque définitivement un parcours —
// mécanisme natif (`error.tsx`, ARCHITECTURE §10) plutôt qu'un état d'erreur
// reconstruit à la main dans chaque écran du cycle d'étude.
//
// « Retour à l'accueil » à côté de « Réessayer » : un cycle qui a changé d'état
// entre deux onglets ou via le bouton retour du navigateur (page servie stale)
// fait planter n'importe quel garde de service avec une erreur qui n'a rien de
// transitoire — « Réessayer » relance la même action sur la même page périmée
// et replante à l'identique. Incident réel constaté en usage.

export default function FocusError({ reset }: { error: Error; reset: () => void }) {
  return (
    <FocusShell>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-error">
          Une erreur est survenue. Ta restitution, si tu en avais soumis une, est déjà sauvegardée.
        </p>
        <div className="flex gap-2">
          <Button size="sm" label="Réessayer" onClick={reset} />
          <Button size="sm" variant="secondary" label="Retour à l'accueil" href="/" as={Link} />
        </div>
      </div>
    </FocusShell>
  );
}
