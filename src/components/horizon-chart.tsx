import type { Horizon } from "@/core/planner/computeHorizon";

// U11 HorizonChart (FUNCTIONS §6, TECH_MAPPING §4.2) : barres pures Tailwind,
// zéro lib de charts. Trois chiffres (dette, J7, J30) + barres proportionnelles
// par matière, échéances d'examens en liste (pas de vraie timeline ce bloc-ci —
// la mise en forme des données vient de P8, la présentation reste minimale).
export function HorizonChart({
  horizon,
  subjectNomById,
}: {
  horizon: Horizon;
  subjectNomById: Map<string, string>;
}) {
  const max = Math.max(1, ...horizon.parMatiere.map((m) => m.chargeJ30));

  return (
    <div className="flex flex-col gap-3 rounded border p-4">
      <div className="flex gap-6 text-sm">
        <div>
          <div className="text-2xl font-semibold">{horizon.dette}</div>
          <div className="text-muted-foreground">en retard</div>
        </div>
        <div>
          <div className="text-2xl font-semibold">{horizon.chargeJ7}</div>
          <div className="text-muted-foreground">sous 7 jours</div>
        </div>
        <div>
          <div className="text-2xl font-semibold">{horizon.chargeJ30}</div>
          <div className="text-muted-foreground">sous 30 jours</div>
        </div>
      </div>

      {horizon.parMatiere.length > 0 && (
        <ul className="flex flex-col gap-1">
          {horizon.parMatiere.map((m) => (
            <li key={m.subjectId} className="flex items-center gap-2 text-sm">
              <span className="w-32 truncate">{subjectNomById.get(m.subjectId) ?? "Matière"}</span>
              <div className="bg-muted h-3 flex-1 overflow-hidden rounded">
                <div
                  className="bg-primary h-full"
                  style={{ width: `${(m.chargeJ30 / max) * 100}%` }}
                />
              </div>
              <span className="text-muted-foreground w-10 text-right">{m.chargeJ30}</span>
            </li>
          ))}
        </ul>
      )}

      {horizon.examens.length > 0 && (
        <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
          {horizon.examens.map((e) => (
            <li key={e.subjectId}>
              {subjectNomById.get(e.subjectId) ?? "Matière"} — examen dans {e.joursRestants}j
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
