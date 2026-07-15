"use client";

import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { ErrorCandidatesPanel } from "@/components/error-candidates-panel";
import type { MergedDiffPoint, MergedErrorCandidate } from "@/core/correction/verdict";

// U16 CorrectionView (FUNCTIONS §6.2, USER_FLOW É3.3, REVAMP v2 2026-07-15 +
// fusion Machine B/C 2026-07-15) — diff toujours affiché en entier (divulgation
// toujours complète, P10 supprimé) ; verdict proposé purement informatif, ne
// conditionne plus les boutons. Boutons d'issue selon la TENTATIVE : n°1 →
// relire+refaire / Feynman / abandonner ; n°2 (dernière possible) → Feynman /
// abandonner. Seul écran de correction depuis la fusion Machine B/C — étude ET
// révision y passent identiquement (U18 FsrsRatingBar a déménagé sur le bilan,
// É3.5, condition de clôture de tout cycle plutôt qu'alternative ici).

const statutIcon: Record<MergedDiffPoint["statut"], string> = {
  couvert: "✅",
  manquant: "❌",
  deforme: "⚠️",
};

// Exporté : réutilisé par la vue session lecture seule (/session/[id], U24).
export function DiffList({ diff }: { diff: MergedDiffPoint[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {diff.map((p, i) => (
        <li key={i} className="flex flex-col gap-1 rounded border p-3">
          <div className="flex items-center gap-2">
            <span aria-hidden>{statutIcon[p.statut]}</span>
            <span className="font-medium">{p.intitule}</span>
          </div>
          {p.explication && <p className="text-sm text-secondary">{p.explication}</p>}
          {p.attendu && <p className="text-sm">{p.attendu}</p>}
        </li>
      ))}
    </ul>
  );
}

export function CorrectionView({
  sectionTitre,
  tentative,
  verdict,
  diff,
  erreursCandidates,
  relireAction,
  abandonAction,
  passerFeynmanAction,
}: {
  sectionTitre: string;
  tentative: number;
  verdict: "acquis" | "insuffisant";
  diff: MergedDiffPoint[];
  erreursCandidates: MergedErrorCandidate[];
  /** Disponible seulement à la tentative 1 (pas de 3ᵉ passe). */
  relireAction?: (formData: FormData) => Promise<void>;
  abandonAction?: () => Promise<void>;
  passerFeynmanAction?: (formData: FormData) => Promise<void>;
}) {
  // Les boutons d'issue sont des <form> INDÉPENDANTS — sans ce drapeau partagé,
  // cliquer deux boutons en succession rapide envoie deux mutations concurrentes
  // sur le même cycle (l'une gagne, l'autre plante sur le garde d'état : incident
  // réel constaté en usage sur cet écran).
  const [submitting, setSubmitting] = useState(false);
  const lockSubmit = () => setSubmitting(true);

  // USER_FLOW É3.3 « Règle de commit » : les index rejetés sont sérialisés dans un
  // champ caché, dupliqué dans les formulaires de sortie qui committent (relire/Feynman).
  const [rejected, setRejected] = useState<boolean[]>(() => erreursCandidates.map(() => false));
  const rejectedIndexesField = JSON.stringify(rejected.flatMap((r, i) => (r ? [i] : [])));

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">{sectionTitre}</h1>
        <Badge variant="neutral" label={`tentative n°${tentative}`} />
      </div>

      <p className="text-sm">
        Verdict proposé : <strong>{verdict}</strong>
      </p>

      <DiffList diff={diff} />
      <ErrorCandidatesPanel
        candidates={erreursCandidates}
        rejected={rejected}
        onChange={(i, r) => setRejected((prev) => prev.map((p, pi) => (pi === i ? r : p)))}
      />

      <div className="flex flex-wrap gap-2">
        {tentative === 1 && relireAction && (
          <form action={relireAction} onSubmit={lockSubmit}>
            <input type="hidden" name="rejectedIndexes" value={rejectedIndexesField} />
            <Button type="submit" size="sm" isDisabled={submitting} label="Relire, puis refaire un blurting" />
          </form>
        )}
        {passerFeynmanAction && (
          <form action={passerFeynmanAction} onSubmit={lockSubmit}>
            <input type="hidden" name="rejectedIndexes" value={rejectedIndexesField} />
            <Button
              type="submit"
              size="sm"
              variant={tentative === 1 ? "secondary" : "primary"}
              isDisabled={submitting}
              label="Passer au Feynman"
            />
          </form>
        )}
        {abandonAction && (
          <form action={abandonAction} onSubmit={lockSubmit}>
            <Button type="submit" variant="ghost" size="sm" isDisabled={submitting} label="Abandonner" />
          </form>
        )}
      </div>
    </div>
  );
}
