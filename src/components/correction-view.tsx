"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorCandidatesPanel } from "@/components/error-candidates-panel";
import { FsrsRatingBar } from "@/components/fsrs-rating-bar";
import type { FilteredDiffPoint, FilteredErrorCandidate } from "@/core/correction/presentCorrection";
import type { ResolveOutcomeResult } from "@/services/session";
import type { Note } from "@/core/fsrs/fsrsCore";

// U16 CorrectionView (FUNCTIONS §6.2, USER_FLOW É3.2/É4.2) — rend exactement ce
// que P10 a laissé passer : par construction, ce composant ne peut pas révéler
// ce que le serveur n'a pas envoyé (aucun champ masqué n'existe côté client tant
// que `revelerAction` n'a pas répondu). Boutons d'issue selon le contexte :
// étude insuffisant → retenter/révéler(/Feynman placeholder) ; étude acquis →
// terminer(/Feynman placeholder) ; révision (`mode="revision"`) → U18
// FsrsRatingBar à la place, la divulgation étant déjà complète d'emblée côté
// serveur (ARCHITECTURE §6, aucune branche retenter/révéler n'a de sens ici).

const statutIcon: Record<FilteredDiffPoint["statut"], string> = {
  couvert: "✅",
  manquant: "❌",
  deforme: "⚠️",
};

// Exporté : réutilisé par la vue session lecture seule (/session/[id], U24).
export function DiffList({ diff }: { diff: FilteredDiffPoint[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {diff.map((p, i) => (
        <li key={i} className="flex flex-col gap-1 rounded border p-3">
          <div className="flex items-center gap-2">
            <span aria-hidden>{statutIcon[p.statut]}</span>
            <span className="font-medium">{p.intitule}</span>
          </div>
          {p.explication && <p className="text-sm text-muted-foreground">{p.explication}</p>}
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
  divulgation,
  mode = "etude",
  retenterAction,
  revelerAction,
  terminerAction,
  ratingPreview,
  rateAction,
}: {
  sectionTitre: string;
  tentative: number;
  verdict: "acquis" | "insuffisant";
  diff: FilteredDiffPoint[];
  erreursCandidates: FilteredErrorCandidate[];
  divulgation: "controlee" | "complete";
  /** Étude (défaut) : retenter/révéler/terminer. Révision : U18 à la place (aucune
   *  branche retenter/révéler n'a de sens, divulgation déjà complète — ARCHITECTURE §6). */
  mode?: "etude" | "revision";
  retenterAction?: (formData: FormData) => Promise<void>;
  revelerAction?: (prevState: unknown, formData: FormData) => Promise<ResolveOutcomeResult>;
  terminerAction?: (formData: FormData) => Promise<void>;
  ratingPreview?: Record<Note, { due: string }>;
  rateAction?: (note: Note, formData: FormData) => Promise<void>;
}) {
  // `useActionState` ne peut pas être appelé conditionnellement : en mode
  // révision, `revelerAction` n'est jamais fourni ni jamais invoqué (aucun
  // bouton révéler n'est rendu plus bas) — le stub ne sert qu'à satisfaire le hook.
  const [revealed, revealFormAction, revealPending] = useActionState(
    revelerAction ?? (async () => ({ outcome: "retenter" as const })),
    undefined,
  );
  const isRevealed = revealed?.outcome === "reveler";

  // USER_FLOW É3.2 « Règle de commit » : les index rejetés sont sérialisés dans un
  // champ caché, dupliqué dans les 3 formulaires de sortie (retenter/révéler/
  // terminer) — chacun commit via S7.commitCandidates côté serveur.
  const [rejected, setRejected] = useState<boolean[]>(() => erreursCandidates.map(() => false));
  const rejectedIndexesField = JSON.stringify(rejected.flatMap((r, i) => (r ? [i] : [])));

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">{sectionTitre}</h1>
        <Badge variant="outline">tentative n°{tentative}</Badge>
      </div>

      <p className="text-sm">
        Verdict proposé : <strong>{isRevealed ? "insuffisant" : verdict}</strong>
      </p>
      {!isRevealed && divulgation === "controlee" && (
        <p className="text-xs text-muted-foreground">
          Les réponses attendues restent masquées tant qu&apos;un nouvel essai est possible.
        </p>
      )}

      <DiffList diff={isRevealed ? revealed.diff : diff} />
      {isRevealed ? (
        <ErrorCandidatesPanel
          candidates={revealed.erreursCandidates}
          rejected={revealed.erreursCandidates.map(() => false)}
          onChange={() => {}}
          readOnly
        />
      ) : (
        <ErrorCandidatesPanel
          candidates={erreursCandidates}
          rejected={rejected}
          onChange={(i, r) => setRejected((prev) => prev.map((p, pi) => (pi === i ? r : p)))}
        />
      )}

      {mode === "revision" ? (
        <FsrsRatingBar
          verdict={verdict}
          preview={ratingPreview!}
          rejectedIndexesField={rejectedIndexesField}
          rateAction={rateAction!}
        />
      ) : isRevealed ? (
        <Link href="/" className="self-start text-sm underline">
          Retour à l&apos;accueil
        </Link>
      ) : (
        <div className="flex flex-wrap gap-2">
          {verdict === "insuffisant" && (
            <>
              <form action={retenterAction}>
                <input type="hidden" name="rejectedIndexes" value={rejectedIndexesField} />
                <Button type="submit" size="sm">
                  Retenter plus tard
                </Button>
              </form>
              <form action={revealFormAction}>
                <input type="hidden" name="rejectedIndexes" value={rejectedIndexesField} />
                <Button type="submit" size="sm" variant="outline" disabled={revealPending}>
                  {revealPending ? "…" : "Révéler les réponses"}
                </Button>
              </form>
            </>
          )}
          {verdict === "acquis" && (
            <form action={terminerAction}>
              <input type="hidden" name="rejectedIndexes" value={rejectedIndexesField} />
              <Button type="submit" size="sm">
                Terminer l&apos;étude
              </Button>
            </form>
          )}
          <Button size="sm" variant="ghost" disabled title="Feynman arrive en Phase 7">
            Passer au Feynman (bientôt disponible)
          </Button>
        </div>
      )}
    </div>
  );
}
