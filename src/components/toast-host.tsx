"use client";

import { useEffect, type ReactNode } from "react";
import { useToast } from "@astryxdesign/core/Toast";

// ToastHost (IMPLEMENT_SCHEDULE.md §6) — astryx `useToast`/`ToastViewport` gère
// déjà positionnement, empilement, auto-dismiss et dédoublonnage (aucun
// composant maison à écrire pour ça, TECH_MAPPING §0 « natif/lib d'abord »).
// Ce module ajoute la seule règle produit qu'astryx ne connaît pas : pile max
// 3 + file FIFO au-delà (§8 critère 7).

export interface AppToastOptions {
  body: ReactNode;
  /** "info" s'auto-ferme en 5 s ; "action" reste jusqu'à dismissal explicite (§6). */
  kind?: "info" | "action";
  endContent?: ReactNode;
  uniqueID?: string;
  /** Croix cliquée (fermeture manuelle) — jamais l'auto-hide (§6 : « Croix = dismissedAt »). */
  onManualDismiss?: () => void;
}

type ShowToast = ReturnType<typeof useToast>;

let showToastRef: ShowToast | null = null;
let activeCount = 0;
const MAX_VISIBLE = 3;
const queue: (() => void)[] = [];

function processQueue() {
  while (activeCount < MAX_VISIBLE && queue.length > 0) {
    queue.shift()!();
  }
}

export function queueToast(opts: AppToastOptions) {
  queue.push(() => {
    if (!showToastRef) return;
    activeCount++;
    showToastRef({
      body: opts.body,
      type: "info",
      isAutoHide: opts.kind !== "action",
      endContent: opts.endContent,
      uniqueID: opts.uniqueID,
      onHide: (reason) => {
        activeCount = Math.max(0, activeCount - 1);
        if (reason === "manual") opts.onManualDismiss?.();
        processQueue();
      },
    });
  });
  processQueue();
}

// Monté une fois dans AppShell — capture le show() d'astryx pour que
// `queueToast` soit appelable depuis n'importe où (event handlers, timers).
export function ToastBridge() {
  const showToast = useToast();
  useEffect(() => {
    showToastRef = showToast;
    processQueue();
    return () => {
      showToastRef = null;
    };
  }, [showToast]);
  return null;
}
