import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import * as ficheService from "@/services/fiche";
import { FicheIntrouvableError } from "@/services/ownership";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { MarkdownViewer } from "@/components/markdown-viewer";
import { commencerAction } from "../../../(focus)/etude/[ficheId]/actions";

// Fiche en lecture seule (USER_FLOW.md v2) : contenu, prochaine révision,
// historique des sessions notées. Hors session : rien n'y est mesuré.

const NOTE_LABEL = { again: "Again", hard: "Hard", good: "Good", easy: "Easy" } as const;

function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(`${d}T00:00:00Z`) : d;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function FichePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();

  let data;
  try {
    data = await ficheService.getFiche(userId, id);
  } catch (e) {
    if (e instanceof FicheIntrouvableError) notFound();
    throw e;
  }
  const { fiche, set, subject, card, cycles } = data;
  const etudiable = fiche.statut !== "archivee" && set.statut === "actif" && subject.statut === "active";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-secondary">
          {subject.nom} · {set.titre}
        </p>
        <h1 className="text-xl font-semibold">
          {fiche.numero}. {fiche.titre}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {fiche.statut === "nouvelle" && <Badge variant="neutral" label="jamais étudiée" />}
          {fiche.statut === "archivee" && <Badge variant="neutral" label="retirée du set" />}
          {card && fiche.statut === "en_revision" && (
            <Badge variant="neutral" label={`prochaine révision : ${formatDate(card.due)}`} />
          )}
          {etudiable && (
            <form action={commencerAction.bind(null, fiche.id)}>
              <Button type="submit" size="sm" label="Étudier maintenant" />
            </form>
          )}
        </div>
      </div>

      <div className="rounded-none border border-border p-4">
        <MarkdownViewer markdown={fiche.contenu} className="font-serif" />
      </div>

      {cycles.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Historique</h2>
          <ul className="flex flex-col divide-y divide-border border border-border text-sm">
            {cycles.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-3 py-2">
                <span>
                  {formatDate(c.closedAt!)} · {c.type === "revision" ? "révision" : "première étude"}
                </span>
                {c.note && <Badge variant="neutral" label={NOTE_LABEL[c.note]} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
