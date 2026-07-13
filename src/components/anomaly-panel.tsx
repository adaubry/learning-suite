"use client";

import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import type { Anomaly } from "@/core/parser/types";
import { anomalyKey } from "@/core/parser/validateDocument";

// U5 AnomalyPanel (FUNCTIONS §6.1) : liste d'anomalies cliquables (scroll vers
// l'occurrence via les ancrages `data-md-*` posés par U3), acquittement
// individuel ou global.

const typeLabel: Record<Anomaly["type"], string> = {
  hierarchie_non_descendante: "Hiérarchie",
  gras_italique_ambigu: "Gras + italique",
  markdown_mal_forme: "Markdown mal formé",
};

function scrollToAnomaly(anomaly: Anomaly) {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("[data-md-start]"));
  let best: HTMLElement | undefined;
  let bestSpan = Infinity;
  for (const el of candidates) {
    const start = Number(el.dataset.mdStart);
    const end = Number(el.dataset.mdEnd);
    if (start <= anomaly.start && anomaly.end <= end && end - start < bestSpan) {
      best = el;
      bestSpan = end - start;
    }
  }
  best?.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function AnomalyPanel({
  anomalies,
  acknowledged,
  onAcknowledge,
  onAcknowledgeAll,
}: {
  anomalies: Anomaly[];
  acknowledged: Set<string>;
  onAcknowledge: (key: string) => void;
  onAcknowledgeAll: () => void;
}) {
  if (anomalies.length === 0) {
    return <p className="text-sm text-secondary">Aucune anomalie détectée.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {anomalies.length} anomalie{anomalies.length > 1 ? "s" : ""}
        </p>
        <Button type="button" size="sm" variant="secondary" label="Acquitter tout" onClick={onAcknowledgeAll} />
      </div>
      <ul className="flex flex-col gap-2">
        {anomalies.map((anomaly) => {
          const key = anomalyKey(anomaly);
          const done = acknowledged.has(key);
          return (
            <li
              key={key}
              className="flex items-start justify-between gap-3 rounded border border-border p-2 text-sm"
            >
              <button
                type="button"
                onClick={() => scrollToAnomaly(anomaly)}
                className="flex-1 text-left"
              >
                <Badge variant="neutral" label={typeLabel[anomaly.type]} />
                <p className="mt-1">{anomaly.message}</p>
              </button>
              <Button
                type="button"
                size="sm"
                variant={done ? "ghost" : "secondary"}
                label={done ? "Acquittée" : "Acquitter"}
                onClick={() => onAcknowledge(key)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
