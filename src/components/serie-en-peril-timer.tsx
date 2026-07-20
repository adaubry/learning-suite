"use client";

import { useEffect, useRef } from "react";
import { queueToast } from "./toast-host";
import { SerieEnPerilActions } from "./toast-alerts";
import { recordSerieEnPerilAction } from "../../app/(app)/regularite/actions";

// serie_en_peril (IMPLEMENT_SCHEDULE.md §5) : seule règle évaluée côté client
// (timer), jamais par `generateAlerts` serveur. Condition : 0 session
// aujourd'hui ET heure locale >= heureAlerteSerie ET série >= 3 (§8 critère 8).
// Vérifiée à chaque minute ; se déclenche au plus une fois par montage (le
// rechargement de demain repart avec un nouveau `sessionsToday`/`streak`).

function afterThreshold(heureAlerteSerie: string): boolean {
  const [h, m] = heureAlerteSerie.split(":").map(Number);
  const now = new Date();
  return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
}

export function SerieEnPerilTimer({
  streak,
  sessionsToday,
  heureAlerteSerie,
  gelsSerieRestants,
}: {
  streak: number;
  sessionsToday: number;
  heureAlerteSerie: string;
  gelsSerieRestants: number;
}) {
  const fired = useRef(false);

  useEffect(() => {
    const eligible = sessionsToday === 0 && streak >= 3;
    if (!eligible || fired.current) return;

    const check = async () => {
      if (fired.current || !afterThreshold(heureAlerteSerie)) return;
      fired.current = true;
      await recordSerieEnPerilAction();
      queueToast({
        body: (
          <span>
            <strong>Série en péril</strong> — aucune session aujourd&apos;hui.
          </span>
        ),
        kind: "action",
        uniqueID: "serie_en_peril_client",
        endContent: <SerieEnPerilActions gelsSerieRestants={gelsSerieRestants} />,
      });
    };

    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [streak, sessionsToday, heureAlerteSerie, gelsSerieRestants]);

  return null;
}
