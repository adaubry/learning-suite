"use client";

import { useEffect, useRef } from "react";
import NextLink from "next/link";
import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";
import { queueToast } from "./toast-host";
import { dismissAlertAction, freezeStreakAction } from "../../app/(app)/regularite/actions";
import { ALERT_LABELS } from "@/core/planner/generateAlerts";
import type { alert as alertTable } from "@/db/schema";

// Toasts actionnables (IMPLEMENT_SCHEDULE.md §6) — echeance_j7, serie_en_peril,
// dette_reports, pic_charge. Un seul affichage par alerte et par session
// navigateur (Set en ref) : re-render/navigation dans (app)/ ne la reproposent
// pas indéfiniment ; un rechargement complet la remontre tant qu'elle reste
// visible côté serveur (dismissedAt toujours null) — comportement voulu, pas
// un bug (§6 : « Croix = dismissedAt », donc fermer la croix la fait taire
// pour de bon).

type Alert = typeof alertTable.$inferSelect;

// Partagé avec SerieEnPerilTimer (même alerte, deux points de déclenchement :
// le toast générique ici, le timer client dédié là-bas).
export function SerieEnPerilActions({ gelsSerieRestants }: { gelsSerieRestants: number }) {
  return (
    <div className="flex gap-2">
      <Link as={NextLink} href="/" isStandalone hasUnderline>
        Démarrer une session
      </Link>
      {gelsSerieRestants > 0 && (
        <Button
          variant="ghost"
          size="sm"
          label="Utiliser un gel"
          clickAction={async () => {
            await freezeStreakAction();
            queueToast({ body: "Gel utilisé", kind: "info" });
          }}
        />
      )}
    </div>
  );
}

function actionsFor(alert: Alert, gelsSerieRestants: number) {
  switch (alert.type) {
    case "serie_en_peril":
      return <SerieEnPerilActions gelsSerieRestants={gelsSerieRestants} />;
    case "dette_reports":
      return (
        <Link as={NextLink} href="/" isStandalone hasUnderline>
          Rattraper
        </Link>
      );
    default:
      return (
        <Link as={NextLink} href="/regularite" isStandalone hasUnderline>
          Voir
        </Link>
      );
  }
}

function bodyFor(alert: Alert) {
  const payload = alert.payload as { libelle?: string } | null;
  return (
    <span>
      <strong>{ALERT_LABELS[alert.type] ?? alert.type}</strong>
      {payload?.libelle ? ` — ${payload.libelle}` : ""}
    </span>
  );
}

export function ToastAlerts({ alerts, gelsSerieRestants }: { alerts: Alert[]; gelsSerieRestants: number }) {
  const shown = useRef(new Set<string>());

  useEffect(() => {
    for (const alert of alerts) {
      if (shown.current.has(alert.id)) continue;
      shown.current.add(alert.id);
      queueToast({
        body: bodyFor(alert),
        kind: "action",
        uniqueID: alert.id,
        endContent: actionsFor(alert, gelsSerieRestants),
        onManualDismiss: () => {
          void dismissAlertAction(alert.id);
        },
      });
    }
  }, [alerts, gelsSerieRestants]);

  return null;
}
