"use client";

import { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import type { FeynmanBilan } from "@/services/session";

// U21 FeynmanReportView (FUNCTIONS §6.2, USER_FLOW É3.4) — bilan L5 : par point
// de contrôle {démontré/récité/non abordé}, points solides, lacunes, verdict
// proposé, actions (valider / refaire / revenir au blurting). Formulaires
// natifs (pas de client JS requis pour la soumission elle-même) : la
// « confirmation explicite » d'un bilan insuffisant (USER_FLOW É3.4) est un
// bouton distinct, pas une case à cocher.
//
// Les trois actions mutent le MÊME cycle (valider/refaire/revenir) — sans
// drapeau partagé, cliquer deux boutons en succession rapide envoie deux
// mutations concurrentes ; l'une gagne, l'autre plante sur le garde d'état de
// S4 (même classe d'incident que correction-view.tsx, constaté en usage).

const STATUT_LABEL: Record<string, string> = {
  demontre: "✅ Démontré",
  recite: "🟡 Récité",
  non_aborde: "❌ Non abordé",
};

export function FeynmanReportView({
  sectionTitre,
  bilan,
  validerAction,
  refaireAction,
  revenirAction,
}: {
  sectionTitre: string;
  bilan: FeynmanBilan;
  validerAction: (formData: FormData) => Promise<void>;
  refaireAction: () => Promise<void>;
  revenirAction: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const lockSubmit = () => setSubmitting(true);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">{sectionTitre}</h1>
        <Badge variant="neutral" label="Bilan Feynman" />
      </div>

      <p className="text-sm">
        Verdict proposé : <strong>{bilan.verdict}</strong>
      </p>

      <ul className="flex flex-col gap-2">
        {bilan.points.map((p, i) => (
          <li key={i} className="flex flex-col gap-1 rounded border border-border p-3">
            <div className="flex items-center gap-2">
              <span aria-hidden>{STATUT_LABEL[p.statut] ?? p.statut}</span>
              <span className="font-medium">{p.intitule}</span>
            </div>
            <p className="text-sm text-secondary">{p.commentaire}</p>
          </li>
        ))}
      </ul>

      {bilan.pointsSolides.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold">Points solides</h2>
          <ul className="list-inside list-disc text-sm">
            {bilan.pointsSolides.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {bilan.lacunes.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold">Lacunes</h2>
          <ul className="list-inside list-disc text-sm">
            {bilan.lacunes.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {bilan.verdict === "acquis" ? (
          <form action={validerAction} onSubmit={lockSubmit}>
            <Button type="submit" size="sm" isDisabled={submitting} label="Valider la section" />
          </form>
        ) : (
          <form action={validerAction} onSubmit={lockSubmit}>
            <input type="hidden" name="override" value="true" />
            <Button type="submit" size="sm" variant="secondary" isDisabled={submitting} label="Valider quand même (bilan insuffisant)" />
          </form>
        )}
        <form action={refaireAction} onSubmit={lockSubmit}>
          <Button type="submit" size="sm" variant="secondary" isDisabled={submitting} label="Refaire un Feynman" />
        </form>
        <form action={revenirAction} onSubmit={lockSubmit}>
          <Button type="submit" size="sm" variant="ghost" isDisabled={submitting} label="Revenir au blurting" />
        </form>
      </div>
    </div>
  );
}
