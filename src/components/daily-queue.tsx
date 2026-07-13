"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronUpIcon, ChevronDownIcon } from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import type { QueueItem } from "@/core/planner/buildDailyQueue";

export interface QueueSectionInfo {
  titre: string;
  subjectNom: string;
}

// U10 DailyQueue + QueueCard (FUNCTIONS §6, TECH_MAPPING §4.2). Réordonnancement
// v1 : boutons monter/descendre (shadcn Button), pas de drag & drop HTML5 ce
// bloc-ci (amélioration progressive différée). Chaque bouton renvoie la liste
// complète des clés (S5.reorder remplace toute la permutation du jour).
//
// Un seul verrou pour TOUTE la file, pas par ligne : monter/descendre envoie le
// tableau `keys` COMPLET (S5.reorder remplace toute la permutation), donc deux
// clics sur deux lignes différentes mutent la même entité (l'ordre du jour) —
// sans verrou partagé, le second écrase silencieusement le premier avec un
// snapshot `keys` déjà périmé (même classe de bug que correction-view.tsx).
export function DailyQueue({
  queue,
  infoById,
  keys,
  moveAction,
  deferAction,
  nextDeadline,
  backlogCandidate,
  advanceAction,
}: {
  queue: QueueItem[];
  infoById: Map<string, QueueSectionInfo>;
  keys: string[];
  moveAction: (index: number, direction: "up" | "down", formData: FormData) => Promise<void>;
  deferAction: (itemType: "etude" | "revision", itemId: string) => Promise<void>;
  /** Prochaine échéance ISO (S5.nextDeadline), ou null si aucune ReviewCard active (USER_FLOW É2.0). */
  nextDeadline: string | null;
  /** Candidate en tête de vivier (S5.nextBacklogCandidate), ou null si le vivier est vide. */
  backlogCandidate: { sectionId: string; titre: string } | null;
  /** Avance la candidate à aujourd'hui en empruntant un slot de demain (S5.advanceFromBacklog). */
  advanceAction: (sectionId: string) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const lockSubmit = () => setSubmitting(true);

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 text-sm">
        <p className="text-secondary">
          Rien à faire aujourd&apos;hui.{" "}
          {nextDeadline
            ? `Prochaine échéance : ${nextDeadline}.`
            : "Aucune échéance à venir."}
        </p>
        <div className="flex gap-2">
          <Button size="sm" label="Importer un chapitre" href="/importer" as={Link} />
          {backlogCandidate && (
            <form action={advanceAction.bind(null, backlogCandidate.sectionId)}>
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                label={`Avancer « ${backlogCandidate.titre} » (emprunte un slot de demain)`}
              />
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-2">
      {queue.map((item, index) => {
        const sectionId = item.kind === "re_file" ? item.itemId : item.sectionId;
        const info = infoById.get(sectionId);
        const itemType = item.kind === "re_file" ? item.itemType : item.kind === "revision" ? "revision" : "etude";
        const commencerHref = itemType === "etude" ? `/etude/${sectionId}` : `/revision/${sectionId}`;

        return (
          <li key={keys[index]} className="flex items-center gap-3 rounded border border-border p-3">
            <div className="flex flex-col gap-1">
              {(
                [
                  { direction: "up" as const, label: "Monter", icon: <ChevronUpIcon size={16} />, disabled: index === 0 },
                  { direction: "down" as const, label: "Descendre", icon: <ChevronDownIcon size={16} />, disabled: index === queue.length - 1 },
                ]
              ).map((move) => (
                <form key={move.direction} action={moveAction.bind(null, index, move.direction)} onSubmit={lockSubmit}>
                  <input type="hidden" name="keys" value={JSON.stringify(keys)} />
                  <Button
                    type="submit"
                    size="lg"
                    variant="ghost"
                    isIconOnly
                    icon={move.icon}
                    isDisabled={move.disabled || submitting}
                    label={move.label}
                  />
                </form>
              ))}
            </div>

            <div className="flex flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {item.kind === "revision" && (
                  <Badge variant="neutral" label={`Révision${item.retardJours > 0 ? ` — ${item.retardJours}j de retard` : ""}`} />
                )}
                {item.kind === "nouvelle_etude" && <Badge variant="neutral" label="Nouvelle étude" />}
                {item.kind === "re_file" && <Badge variant="neutral" label="À repasser aujourd'hui" />}
                {info && <span className="text-secondary">{info.subjectNom}</span>}
                {"importance" in item && <Badge variant="neutral" label={`imp. ${item.importance}`} />}
                {"joursAvantExamen" in item && item.joursAvantExamen !== null && item.joursAvantExamen < 30 && (
                  <Badge variant="warning" label={`examen dans ${item.joursAvantExamen}j`} />
                )}
              </div>
              <span>{info?.titre ?? "Section"}</span>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" label="Commencer" href={commencerHref} as={Link} />
              <form action={deferAction.bind(null, itemType, sectionId)} onSubmit={lockSubmit}>
                <Button type="submit" size="sm" variant="ghost" isDisabled={submitting} label="Reporter" />
              </form>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
