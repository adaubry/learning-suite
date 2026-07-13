import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import type { FilteredErrorCandidate } from "@/core/correction/presentCorrection";

const typeLabel: Record<FilteredErrorCandidate["type"], string> = {
  omission: "Omission",
  deformation: "Déformation",
  confusion: "Confusion",
  imprecision: "Imprécision",
};

// U17 ErrorCandidatesPanel (FUNCTIONS §6.2, USER_FLOW É3.2, DECISIONS.md bloc
// 5.3) : « Règle de commit » — supprimer / [Tout accepter] (édition du texte
// laissée au carnet, S7.edit, post-commit — revu ponytail-review : dupliquer
// cette mutation ici n'ajoutait rien). Ce qui n'est pas explicitement rejeté
// est committé par le parent (CorrectionView) au moment de quitter l'écran, y
// compris sans aucune action de l'utilisateur.
export function ErrorCandidatesPanel({
  candidates,
  rejected,
  onChange,
  readOnly = false,
}: {
  candidates: FilteredErrorCandidate[];
  rejected: boolean[];
  onChange: (index: number, rejected: boolean) => void;
  /** Correction déjà résolue (ex. après révélation) : candidates déjà committées, aucune action possible. */
  readOnly?: boolean;
}) {
  if (candidates.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded border border-border p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Erreurs candidates {readOnly ? "" : "(proposées)"}</h2>
        {!readOnly && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            label="Tout accepter"
            onClick={() => candidates.forEach((_, i) => onChange(i, false))}
          />
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {candidates.map((c, i) => (
          <li key={i} className={`flex flex-col gap-1 text-sm ${rejected[i] ? "opacity-50" : ""}`}>
            <div className="flex items-center gap-2">
              <Badge variant="neutral" label={typeLabel[c.type]} />
              {c.idErreurExistante && <Badge variant="neutral" label="récidive" />}
              {!readOnly && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  label={rejected[i] ? "Restaurer" : "Supprimer"}
                  onClick={() => onChange(i, !rejected[i])}
                />
              )}
            </div>
            <p className="text-secondary">
              {c.description ?? "Détail masqué tant qu'un nouvel essai est attendu."}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
