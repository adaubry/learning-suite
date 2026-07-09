import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FeynmanBilan } from "@/services/session";

// U21 FeynmanReportView (FUNCTIONS §6.2, USER_FLOW É3.4) — bilan L5 : par point
// de contrôle {démontré/récité/non abordé}, points solides, lacunes, verdict
// proposé, actions (valider / refaire / revenir au blurting). Formulaires
// natifs (pas de client JS requis) : la « confirmation explicite » d'un bilan
// insuffisant (USER_FLOW É3.4) est un bouton distinct, pas une case à cocher.

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
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">{sectionTitre}</h1>
        <Badge variant="outline">Bilan Feynman</Badge>
      </div>

      <p className="text-sm">
        Verdict proposé : <strong>{bilan.verdict}</strong>
      </p>

      <ul className="flex flex-col gap-2">
        {bilan.points.map((p, i) => (
          <li key={i} className="flex flex-col gap-1 rounded border p-3">
            <div className="flex items-center gap-2">
              <span aria-hidden>{STATUT_LABEL[p.statut] ?? p.statut}</span>
              <span className="font-medium">{p.intitule}</span>
            </div>
            <p className="text-sm text-muted-foreground">{p.commentaire}</p>
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
          <form action={validerAction}>
            <Button type="submit" size="sm">
              Valider la section
            </Button>
          </form>
        ) : (
          <form action={validerAction}>
            <input type="hidden" name="override" value="true" />
            <Button type="submit" size="sm" variant="outline">
              Valider quand même (bilan insuffisant)
            </Button>
          </form>
        )}
        <form action={refaireAction}>
          <Button type="submit" size="sm" variant="outline">
            Refaire un Feynman
          </Button>
        </form>
        <form action={revenirAction}>
          <Button type="submit" size="sm" variant="ghost">
            Revenir au blurting
          </Button>
        </form>
      </div>
    </div>
  );
}
