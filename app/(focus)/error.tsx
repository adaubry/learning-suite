"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

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
    <div className="flex flex-col gap-3">
      <p className="text-sm text-destructive">
        Une erreur est survenue. Ta restitution, si tu en avais soumis une, est déjà sauvegardée.
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={reset}>
          Réessayer
        </Button>
        <Link href="/" className={buttonVariants({ size: "sm", variant: "outline" })}>
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
