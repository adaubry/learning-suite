"use client";

import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { ErrorCandidatesPanel } from "@/components/error-candidates-panel";
import { FsrsRatingBar } from "@/components/fsrs-rating-bar";
import { resumeRaisonnement, type ErreurCandidate, type PointCorrige, type Verdict } from "@/core/fiche/verdict";
import type { Note } from "@/core/fsrs/fsrsCore";

// CorrectionView (ARCHITECTURE.md v2 §2, USER_FLOW.md v2) — restitution, verdict
// proposé, raisonnement x/y, points corrigés, erreurs candidates, puis la sortie :
// tentative 1 → [Relire puis refaire] ou noter ; tentative 2 → noter (Again/Hard).
// Le verdict choisit le bouton mis en avant ; l'utilisateur décide.

const statutDot: Record<PointCorrige["statut"], { variant: "success" | "error" | "warning"; label: string }> = {
  couvert: { variant: "success", label: "Couvert" },
  manquant: { variant: "error", label: "Manquant" },
  deforme: { variant: "warning", label: "Déformé" },
};

// Exporté : réutilisé par l'historique de la fiche (/fiche/[id]).
export function PointList({ points }: { points: PointCorrige[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border border border-border">
      {points.map((p, i) => (
        <li key={i} className="flex flex-col gap-1 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusDot variant={statutDot[p.statut].variant} label={statutDot[p.statut].label} />
            <span className="font-medium">{p.intitule}</span>
            {p.type === "critique" && <Badge variant="neutral" label="essentiel" />}
            {p.raisonnement && <Badge variant="neutral" label="raisonnement" />}
          </div>
          {p.explication && <p className="text-sm text-secondary">{p.explication}</p>}
          {p.statut !== "couvert" && <p className="text-sm">{p.attendu}</p>}
        </li>
      ))}
    </ul>
  );
}

export function CorrectionView({
  ficheTitre,
  numero,
  verdict,
  input,
  points,
  erreursCandidates,
  notes,
  preview,
  relireAction,
  noterAction,
  abandonAction,
}: {
  ficheTitre: string;
  numero: number;
  verdict: Verdict;
  input: string;
  points: PointCorrige[];
  erreursCandidates: ErreurCandidate[];
  notes: Note[];
  preview: Record<Note, { due: string }>;
  /** Tentative 1 seulement. */
  relireAction?: (formData: FormData) => Promise<void>;
  noterAction: (note: Note, formData: FormData) => Promise<void>;
  abandonAction: () => Promise<void>;
}) {
  // Les sorties sont des <form> indépendants qui mutent le même cycle : un verrou
  // commun empêche deux soumissions concurrentes (double clic sur deux boutons).
  const [submitting, setSubmitting] = useState(false);
  const lockSubmit = () => setSubmitting(true);

  // Erreurs candidates rejetées : sérialisées dans chaque formulaire de sortie, le
  // reste est enregistré dans le carnet en quittant l'écran.
  const [rejected, setRejected] = useState<boolean[]>(() => erreursCandidates.map(() => false));
  const rejectedIndexes = JSON.stringify(rejected.flatMap((r, i) => (r ? [i] : [])));

  const raisonnement = resumeRaisonnement(points);
  const couverts = points.filter((p) => p.statut === "couvert").length;
  const relirePrimaire = verdict === "insuffisant" && Boolean(relireAction);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">{ficheTitre}</h1>
        <Badge variant="neutral" label={`tentative n°${numero}`} />
      </div>

      <Banner
        status={verdict === "bon" ? "success" : "warning"}
        title={verdict === "bon" ? "L'essentiel y est" : "Il manque l'essentiel"}
        description={`${couverts}/${points.length} points couverts${
          raisonnement.total ? ` · raisonnement ${raisonnement.couverts}/${raisonnement.total}` : ""
        }. Verdict proposé : c'est toi qui choisis la suite.`}
      />

      <details className="flex flex-col gap-1 rounded-none border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">Ta restitution</summary>
        <p className="mt-2 whitespace-pre-wrap text-sm text-secondary">{input}</p>
      </details>

      <PointList points={points} />
      <ErrorCandidatesPanel
        candidates={erreursCandidates}
        rejected={rejected}
        onChange={(i, r) => setRejected((prev) => prev.map((p, pi) => (pi === i ? r : p)))}
      />

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        {relireAction && (
          <form action={relireAction} onSubmit={lockSubmit}>
            <input type="hidden" name="rejectedIndexes" value={rejectedIndexes} />
            <Button
              type="submit"
              variant={relirePrimaire ? "primary" : "secondary"}
              isDisabled={submitting}
              label="Relire la fiche, puis refaire un blurting"
            />
          </form>
        )}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">
            {numero === 2
              ? "Après une relecture, le rappel à froid n'a pas tenu : Again ou Hard."
              : "À quel point c'était difficile de t'en souvenir ?"}
          </p>
          <FsrsRatingBar
            notes={notes}
            preview={preview}
            rateAction={noterAction}
            hiddenFields={{ rejectedIndexes }}
            disabled={submitting}
            onSubmit={lockSubmit}
          />
        </div>
        <form action={abandonAction} onSubmit={lockSubmit}>
          <Button type="submit" variant="ghost" size="sm" isDisabled={submitting} label="Abandonner" />
        </form>
      </div>
    </div>
  );
}
