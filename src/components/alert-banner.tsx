"use client";

import NextLink from "next/link";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";
import { snoozeAlertAction } from "../../app/(app)/regularite/actions";
import type { alert as alertTable } from "@/db/schema";

// AlertBanner (IMPLEMENT_SCHEDULE.md §6) — rendu par le layout de l'app, jamais
// par l'écran. Une seule alerte à la fois : le layout la choisit déjà via
// `pickBannerAlert` (P13) avant de nous la passer — ce composant ne fait que
// l'afficher. Persistante (jamais d'auto-fermeture), fond danger, non
// snoozable pour jour_j/depassee (renforcé aussi côté service, §6).

type Alert = typeof alertTable.$inferSelect;

const TITLES: Record<string, string> = {
  echeance_jour_j: "Échéance aujourd'hui",
  echeance_j1: "Échéance demain",
  echeance_depassee: "Échéance dépassée",
  echeance_j3: "Échéance dans 3 jours",
};

export function AlertBanner({ alert }: { alert: Alert | null }) {
  if (!alert) return null;
  const payload = alert.payload as { libelle?: string; dueDate?: string } | null;
  const snoozable = alert.type !== "echeance_jour_j" && alert.type !== "echeance_depassee";

  return (
    <Banner
      status="error"
      container="section"
      title={TITLES[alert.type] ?? "Échéance"}
      description={payload?.libelle ?? undefined}
      endContent={
        <div className="flex items-center gap-2">
          <Link as={NextLink} href="/regularite" isStandalone hasUnderline>
            Voir
          </Link>
          {snoozable && (
            <Button
              variant="ghost"
              label="Reporter à demain"
              clickAction={async () => {
                await snoozeAlertAction(alert.id);
              }}
            />
          )}
        </div>
      }
    />
  );
}
