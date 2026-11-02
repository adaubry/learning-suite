import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import type { ErreurCandidate } from "@/core/fiche/verdict";

const typeLabel: Record<ErreurCandidate["type"], string> = {
  omission: "Omission",
  deformation: "Déformation",
  confusion: "Confusion",
  imprecision: "Imprécision",
};

// ErrorCandidatesPanel : erreurs proposées par la correction — rejeter / [Tout
// accepter] (l'édition du texte se fait ensuite dans le carnet). Ce qui n'est pas
// rejeté est enregistré par le parent quand on quitte l'écran de correction.
export function ErrorCandidatesPanel({
  candidates,
  rejected,
  onChange,
  readOnly = false,
}: {
  candidates: ErreurCandidate[];
  rejected: boolean[];
  onChange: (index: number, rejected: boolean) => void;
  /** Correction déjà résolue (ex. après révélation) : candidates déjà committées, aucune action possible. */
  readOnly?: boolean;
}) {
  if (candidates.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-none border border-border p-3">
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
            <p className="text-secondary">{c.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
