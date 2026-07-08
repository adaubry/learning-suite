"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorCandidatesPanel } from "@/components/error-candidates-panel";
import type { FilteredDiffPoint, FilteredErrorCandidate } from "@/core/correction/presentCorrection";
import type { ResolveOutcomeResult } from "@/services/session";

// U16 CorrectionView (FUNCTIONS §6.2, USER_FLOW É3.2) — rend exactement ce que
// P10 a laissé passer : par construction, ce composant ne peut pas révéler ce
// que le serveur n'a pas envoyé (aucun champ masqué n'existe côté client tant
// que `revelerAction` n'a pas répondu). Boutons d'issue selon verdict : insuffisant
// → retenter/révéler(/Feynman placeholder) ; acquis → terminer(/Feynman placeholder).

const statutIcon: Record<FilteredDiffPoint["statut"], string> = {
  couvert: "✅",
  manquant: "❌",
  deforme: "⚠️",
};

function DiffList({ diff }: { diff: FilteredDiffPoint[] }) {
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
  retenterAction,
  revelerAction,
  terminerAction,
}: {
  sectionTitre: string;
  tentative: number;
  verdict: "acquis" | "insuffisant";
  diff: FilteredDiffPoint[];
  erreursCandidates: FilteredErrorCandidate[];
  divulgation: "controlee" | "complete";
  retenterAction: () => Promise<void>;
  revelerAction: (prevState: unknown, formData: FormData) => Promise<ResolveOutcomeResult>;
  terminerAction: () => Promise<void>;
}) {
  const [revealed, revealFormAction, revealPending] = useActionState(revelerAction, undefined);
  const isRevealed = revealed?.outcome === "reveler";

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
      <ErrorCandidatesPanel candidates={isRevealed ? revealed.erreursCandidates : erreursCandidates} />

      {isRevealed ? (
        <Link href="/" className="self-start text-sm underline">
          Retour à l&apos;accueil
        </Link>
      ) : (
        <div className="flex flex-wrap gap-2">
          {verdict === "insuffisant" && (
            <>
              <form action={retenterAction}>
                <Button type="submit" size="sm">
                  Retenter plus tard
                </Button>
              </form>
              <form action={revealFormAction}>
                <Button type="submit" size="sm" variant="outline" disabled={revealPending}>
                  {revealPending ? "…" : "Révéler les réponses"}
                </Button>
              </form>
            </>
          )}
          {verdict === "acquis" && (
            <form action={terminerAction}>
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
