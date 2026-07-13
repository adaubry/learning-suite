"use client";

import { startTransition, useActionState, useEffect, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownViewer } from "@/components/markdown-viewer";
import { CourseEditor } from "@/components/course-editor";
import { AnomalyPanel } from "@/components/anomaly-panel";
import { ConsequencesDialog } from "@/components/consequences-dialog";
import { ConfirmDialog, StrongConfirmDialog } from "@/components/confirm-dialog";
import { parseChapter } from "@/core/parser/parseChapter";
import { validateDocument, anomalyKey } from "@/core/parser/validateDocument";
import type { Anomaly } from "@/core/parser/types";
import {
  simulateUpdateAction,
  commitUpdateAction,
  archiveChapterAction,
  unarchiveChapterAction,
  deleteChapterAction,
  generateBatchAction,
} from "./actions";

// É6.1 (vue minimale) → É6.2 (éditeur intégré, Bloc 8.3) → É6.3 (ré-import, Bloc 8.4). Les deux
// portes partagent le même pipeline S1.simulateUpdate/commitUpdate (ARCHITECTURE §7) — seule la
// façon d'obtenir le nouveau markdown change (édition WYSIWYG vs upload/collage brut, mêmes
// règles qu'É1.1). Re-trier reste accessible depuis /importer ; archiver/supprimer = Bloc 9.1 ;
// générer en lot (Bloc 9.2 fix, USER_FLOW É6.1) câblé ci-dessous.

type Mode = "vue" | "edition" | "reimport";

export function ChapterEditorScreen({
  chapterId,
  titre,
  initialMarkdown,
  statut,
}: {
  chapterId: string;
  titre: string;
  initialMarkdown: string;
  statut: "actif" | "archive";
}) {
  const [mode, setMode] = useState<Mode>("vue");
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [simState, simAction, simulating] = useActionState(simulateUpdateAction, undefined);
  const [batchState, batchAction, batchPending] = useActionState(
    generateBatchAction.bind(null, chapterId),
    undefined,
  );

  function enterMode(next: Mode) {
    setMarkdown(next === "reimport" ? "" : initialMarkdown);
    setAnomalies([]);
    setAcknowledged(new Set());
    setMode(next);
  }

  // Validation continue de la hiérarchie (P2, USER_FLOW É6.2/É6.3 : « mêmes règles qu'É1.1–
  // É1.2 ») — débouncée : un remark-parse par caractère tapé/collé sur un chapitre de plusieurs
  // dizaines de Ko serait perceptible.
  useEffect(() => {
    if (mode === "vue") return;
    const timeout = setTimeout(() => {
      if (!markdown.trim()) {
        setAnomalies([]);
        return;
      }
      const parsed = parseChapter(markdown);
      setAnomalies(validateDocument(parsed, markdown));
    }, 300);
    return () => clearTimeout(timeout);
  }, [markdown, mode]);

  const allAcknowledged = anomalies.every((a) => acknowledged.has(anomalyKey(a)));

  function handleSave() {
    const fd = new FormData();
    fd.set("chapterId", chapterId);
    fd.set("markdown", markdown);
    startTransition(() => simAction(fd));
  }

  function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    void file.text().then(setMarkdown);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">{titre}</h1>
          {statut === "archive" && <span className="text-xs text-muted-foreground">(archivé)</span>}
        </div>
        {mode === "vue" && (
          <div className="flex gap-2">
            <form action={batchAction}>
              <Button type="submit" size="sm" variant="outline" disabled={batchPending}>
                Générer les rubriques en lot
              </Button>
            </form>
            <Button size="sm" variant="outline" onClick={() => enterMode("reimport")}>
              Ré-importer depuis Google Docs
            </Button>
            <Button size="sm" onClick={() => enterMode("edition")}>
              Modifier dans l&apos;app
            </Button>
          </div>
        )}
      </div>

      {mode === "vue" && (
        <>
          {batchState && (
            <p className="text-sm text-muted-foreground">
              {batchState.total === 0
                ? "Aucune section active sans rubrique."
                : batchState.echecs > 0
                  ? `${batchState.total - batchState.echecs}/${batchState.total} rubriques générées — ${batchState.echecs} en échec, à rédiger à la main depuis leur écran.`
                  : `${batchState.total} rubrique(s) générée(s), à valider.`}
            </p>
          )}
          <details className="rounded border">
            <summary className="cursor-pointer p-3 text-sm font-medium select-none">
              Voir le contenu du chapitre
            </summary>
            <div className="max-h-[32rem] overflow-y-auto border-t p-3">
              <MarkdownViewer markdown={initialMarkdown} />
            </div>
          </details>
          {/* USER_FLOW É6.4 : l'archivage est toujours proposé avant la suppression. */}
          <div className="flex items-center gap-2 border-t pt-3">
            {statut === "actif" ? (
              <ConfirmDialog
                trigger={
                  <Button size="sm" variant="outline">
                    Archiver le chapitre
                  </Button>
                }
                title="Archiver ce chapitre ?"
                description="Le chapitre sort de la file du jour et de la génération paresseuse des rubriques. Réversible à tout moment ; tout l'historique est conservé."
                confirmLabel="Archiver"
                action={archiveChapterAction.bind(null, chapterId)}
              />
            ) : (
              <form action={unarchiveChapterAction.bind(null, chapterId)}>
                <Button size="sm" variant="outline" type="submit">
                  Désarchiver le chapitre
                </Button>
              </form>
            )}
            <StrongConfirmDialog
              trigger={
                <Button size="sm" variant="destructive">
                  Supprimer le chapitre
                </Button>
              }
              title="Supprimer définitivement ce chapitre ?"
              description={`Détruit tout l'historique (sections, rubriques, sessions, erreurs). Irréversible. Réservé aux erreurs de manipulation — préfère l'archivage pour une matière terminée.`}
              confirmWord={titre}
              confirmLabel="Supprimer définitivement"
              action={deleteChapterAction.bind(null, chapterId)}
            />
          </div>
        </>
      )}

      {mode !== "vue" && (
        <div className="flex flex-col gap-4">
          {mode === "edition" ? (
            <>
              <p className="rounded border border-amber-400 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                Pense à reporter cette modification dans ton Google Doc, sinon elle sera écrasée
                au prochain ré-import.
              </p>
              <CourseEditor initialMarkdown={initialMarkdown} onChange={setMarkdown} />
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Google Docs → Fichier → Télécharger → Markdown (.md). Upload du fichier ou
                collage direct — mêmes règles de validation qu&apos;un import.
              </p>
              <Input type="file" accept=".md,text/markdown" onChange={handleFileUpload} />
              <Textarea
                rows={16}
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                placeholder="Colle ici le nouveau contenu Markdown exporté depuis Google Docs…"
              />
            </>
          )}

          {anomalies.length > 0 && (
            <AnomalyPanel
              anomalies={anomalies}
              acknowledged={acknowledged}
              onAcknowledge={(key) => setAcknowledged((prev) => new Set(prev).add(key))}
              onAcknowledgeAll={() => setAcknowledged(new Set(anomalies.map(anomalyKey)))}
            />
          )}

          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => enterMode("vue")}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={simulating || !markdown.trim() || !allAcknowledged}>
              {simulating ? "Analyse…" : mode === "reimport" ? "Analyser le ré-import" : "Sauvegarder"}
            </Button>
            {!allAcknowledged && anomalies.length > 0 && (
              <p className="text-sm text-muted-foreground">Acquitte les anomalies avant de sauvegarder.</p>
            )}
          </div>

          {simState && "error" in simState && <p className="text-sm text-destructive">{simState.error}</p>}
          {simState?.success && !simState.simulation.changed && (
            <p className="text-sm text-muted-foreground">Aucun changement.</p>
          )}
          {simState?.success && simState.simulation.changed && (
            <ConsequencesDialog
              trigger={
                <Button>
                  {mode === "reimport" ? "Confirmer le ré-import" : "Voir les conséquences et confirmer"}
                </Button>
              }
              simulation={simState.simulation}
              action={commitUpdateAction.bind(null, chapterId, simState.markdown, Array.from(acknowledged))}
            />
          )}
        </div>
      )}
    </div>
  );
}
