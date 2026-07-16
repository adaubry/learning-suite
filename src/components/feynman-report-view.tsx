"use client";

import { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { FsrsRatingBar } from "@/components/fsrs-rating-bar";
import type { FeynmanBilan } from "@/services/session";
import type { Note } from "@/core/fsrs/fsrsCore";

// U21 FeynmanReportView (FUNCTIONS §6.2, USER_FLOW É3.5) — bilan L5 : par point
// de contrôle {démontré/récité/non abordé}, points solides, lacunes, verdict
// proposé, actions (refaire / revenir au blurting). Depuis la fusion Machine
// B/C (2026-07-15) : `[Valider la section]` est remplacé par U18 FsrsRatingBar
// — l'auto-note FSRS devient la condition nécessaire à la clôture de TOUT
// cycle (1ʳᵉ étude ou Nᵉ révision), jamais le verdict LLM (ADR 3). Sur un bilan
// insuffisant, la confirmation explicite (USER_FLOW É3.5) reste requise :
// `validerAction` reçoit déjà l'information via son binding côté page (override
// pré-calculé depuis `bilan.verdict`), le choix de la note EST cette confirmation.
//
// Les trois actions mutent le MÊME cycle (noter/refaire/revenir) — sans
// drapeau partagé, cliquer deux boutons en succession rapide envoie deux
// mutations concurrentes ; l'une gagne, l'autre plante sur le garde d'état de
// S4 (même classe d'incident que correction-view.tsx, constaté en usage).

const STATUT_DOT: Record<string, { variant: "success" | "warning" | "error"; label: string }> = {
  demontre: { variant: "success", label: "Démontré" },
  recite: { variant: "warning", label: "Récité" },
  non_aborde: { variant: "error", label: "Non abordé" },
};

export function FeynmanReportView({
  sectionTitre,
  bilan,
  ratingPreview,
  validerAction,
  refaireAction,
  revenirAction,
  abandonAction,
}: {
  sectionTitre: string;
  bilan: FeynmanBilan;
  ratingPreview: Record<Note, { due: string }>;
  validerAction: (note: Note, formData: FormData) => Promise<void>;
  refaireAction: () => Promise<void>;
  revenirAction: () => Promise<void>;
  abandonAction: () => Promise<void>;
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
          <li key={i} className="flex flex-col gap-1 rounded-none border border-border p-3">
            <div className="flex items-center gap-2">
              <StatusDot variant={STATUT_DOT[p.statut]?.variant ?? "neutral"} label={STATUT_DOT[p.statut]?.label ?? p.statut} />
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

      {bilan.verdict !== "acquis" && (
        <p className="text-xs text-secondary">
          Bilan insuffisant : choisir une note ci-dessous valide quand même la section (confirmation journalisée).
        </p>
      )}
      <FsrsRatingBar
        verdict={bilan.verdict}
        preview={ratingPreview}
        rateAction={validerAction}
        disabled={submitting}
        onSubmit={lockSubmit}
      />

      <div className="flex flex-wrap gap-2">
        <form action={refaireAction} onSubmit={lockSubmit}>
          <Button type="submit" size="sm" variant="secondary" isDisabled={submitting} label="Refaire un Feynman" />
        </form>
        <form action={revenirAction} onSubmit={lockSubmit}>
          <Button type="submit" size="sm" variant="ghost" isDisabled={submitting} label="Revenir au blurting" />
        </form>
        <form action={abandonAction} onSubmit={lockSubmit}>
          <Button type="submit" size="sm" variant="ghost" isDisabled={submitting} label="Abandonner" />
        </form>
      </div>
    </div>
  );
}
