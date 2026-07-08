import { Badge } from "@/components/ui/badge";
import type { FilteredErrorCandidate } from "@/core/correction/presentCorrection";

const typeLabel: Record<FilteredErrorCandidate["type"], string> = {
  omission: "Omission",
  deformation: "Déformation",
  confusion: "Confusion",
  imprecision: "Imprécision",
};

// U17 ErrorCandidatesPanel (FUNCTIONS §6.2, USER_FLOW É3.2) — LECTURE SEULE ce
// bloc : édition/suppression/[Tout accepter] écrivent via S7.commitCandidates,
// qui n'existe qu'en Bloc 5.3 (pas de bouton qui ne ferait rien). Même
// divulgation contrôlée que le diff — `description` absente tant qu'un nouvel
// essai est attendu.
export function ErrorCandidatesPanel({ candidates }: { candidates: FilteredErrorCandidate[] }) {
  if (candidates.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded border p-3">
      <h2 className="text-sm font-semibold">Erreurs candidates (proposées)</h2>
      <ul className="flex flex-col gap-2">
        {candidates.map((c, i) => (
          <li key={i} className="flex flex-col gap-1 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{typeLabel[c.type]}</Badge>
              {c.idErreurExistante && <Badge variant="secondary">récidive</Badge>}
            </div>
            <p className="text-muted-foreground">
              {c.description ?? "Détail masqué tant qu'un nouvel essai est attendu."}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
