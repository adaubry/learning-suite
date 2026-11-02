"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronUpIcon, ChevronDownIcon, ChevronsUpIcon } from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import type { QueueItem } from "@/core/planner/buildDailyQueue";

export interface QueueFicheInfo {
  numero: number;
  titre: string;
  setTitre: string;
  subjectNom: string;
}

// DailyQueue — la file du jour (USER_FLOW.md v2). Réordonnancement par boutons
// monter/descendre ; chaque bouton renvoie la liste complète des clés (reorder
// remplace toute la permutation du jour).
//
// Un seul verrou pour TOUTE la file, pas par ligne : monter/descendre envoie le
// tableau `keys` COMPLET (S5.reorder remplace toute la permutation), donc deux
// clics sur deux lignes différentes mutent la même entité (l'ordre du jour) —
// sans verrou partagé, le second écrase silencieusement le premier avec un
// snapshot `keys` déjà périmé.
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
  infoById: Map<string, QueueFicheInfo>;
  keys: string[];
  moveAction: (index: number, direction: "up" | "down" | "top", formData: FormData) => Promise<void>;
  deferAction: (itemType: "etude" | "revision", itemId: string) => Promise<void>;
  /** Prochaine échéance de révision ISO, ou null si aucune carte active. */
  nextDeadline: string | null;
  /** Nouvelle fiche en tête de vivier, ou null si le vivier est vide. */
  backlogCandidate: { ficheId: string; titre: string } | null;
  /** Avance la candidate à aujourd'hui en empruntant un slot de demain. */
  advanceAction: (ficheId: string) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const lockSubmit = () => setSubmitting(true);

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 text-sm">
        <p className="text-primary">
          Rien à faire aujourd&apos;hui.{" "}
          {nextDeadline
            ? `Prochaine échéance : ${new Date(nextDeadline).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.`
            : "Aucune échéance à venir."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" label="Importer des fiches" href="/importer" as={Link} />
          {backlogCandidate && (
            <form action={advanceAction.bind(null, backlogCandidate.ficheId)}>
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
        const ficheId = item.kind === "re_file" ? item.itemId : item.ficheId;
        const info = infoById.get(ficheId);
        const itemType = item.kind === "re_file" ? item.itemType : item.kind === "revision" ? "revision" : "etude";

        return (
          <li key={keys[index]} className="flex flex-wrap items-center gap-3 rounded-none border border-border bg-surface p-3">
            <div className="flex flex-col gap-1">
              {(
                [
                  ...(index > 1
                    ? [{ direction: "top" as const, label: "Tout en haut", icon: <ChevronsUpIcon size={16} />, disabled: false }]
                    : []),
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
                {item.kind === "nouvelle_etude" && <Badge variant="neutral" label="Nouvelle" />}
                {item.kind === "re_file" && <Badge variant="neutral" label="À repasser aujourd'hui" />}
                {info && <span className="text-secondary">{info.subjectNom} · {info.setTitre}</span>}
                {"joursAvantExamen" in item && item.joursAvantExamen !== null && item.joursAvantExamen < 30 && (
                  <Badge variant="warning" label={`examen dans ${item.joursAvantExamen}j`} />
                )}
              </div>
              <span>{info ? `${info.numero}. ${info.titre}` : "Fiche"}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" label="Commencer" href={`/etude/${ficheId}`} as={Link} />
              <form action={deferAction.bind(null, itemType, ficheId)} onSubmit={lockSubmit}>
                <Button type="submit" size="sm" variant="ghost" isDisabled={submitting} label="Reporter" />
              </form>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
