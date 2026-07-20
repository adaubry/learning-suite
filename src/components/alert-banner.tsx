"use client";

import NextLink from "next/link";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";
import { snoozeAlertAction } from "../../app/(app)/regularite/actions";
import { ALERT_LABELS, isSnoozable } from "@/core/planner/generateAlerts";
import type { alert as alertTable } from "@/db/schema";

// AlertBanner (IMPLEMENT_SCHEDULE.md §6) — rendu par le layout de l'app, jamais
// par l'écran. Une seule alerte à la fois : le layout la choisit déjà via
// `pickBannerAlert` (P13) avant de nous la passer — ce composant ne fait que
// l'afficher. Persistante (jamais d'auto-fermeture), fond danger, non
// snoozable pour jour_j/depassee (renforcé aussi côté service, §6).

type Alert = typeof alertTable.$inferSelect;

export function AlertBanner({ alert }: { alert: Alert | null }) {
  if (!alert) return null;
  const payload = alert.payload as { libelle?: string; dueDate?: string } | null;
  const snoozable = isSnoozable(alert.type);

  return (
    <Banner
      status="error"
      title={ALERT_LABELS[alert.type] ?? "Échéance"}
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
