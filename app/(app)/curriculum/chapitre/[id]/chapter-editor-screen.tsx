"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { FileInput } from "@astryxdesign/core/FileInput";
import { TextArea } from "@astryxdesign/core/TextArea";
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

  function handleFileUpload(file: File | File[] | null) {
    if (!file || Array.isArray(file)) return;
    void file.text().then(setMarkdown);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">{titre}</h1>
          {statut === "archive" && <span className="text-xs text-secondary">(archivé)</span>}
        </div>
        {mode === "vue" && (
          <div className="flex gap-2">
            <form action={batchAction}>
              <Button type="submit" size="sm" variant="secondary" label="Générer les rubriques en lot" isDisabled={batchPending} />
            </form>
            <Button size="sm" variant="secondary" label="Ré-importer depuis Google Docs" onClick={() => enterMode("reimport")} />
            <Button size="sm" label="Modifier dans l'app" onClick={() => enterMode("edition")} />
          </div>
        )}
      </div>

      {mode === "vue" && (
        <>
          {batchState && (
            <p className="text-sm text-secondary">
              {batchState.total === 0
                ? "Aucune section active sans rubrique."
                : batchState.echecs > 0
                  ? `${batchState.total - batchState.echecs}/${batchState.total} rubriques générées — ${batchState.echecs} en échec, à rédiger à la main depuis leur écran.`
                  : `${batchState.total} rubrique(s) générée(s), à valider.`}
            </p>
          )}
          <MarkdownViewer markdown={initialMarkdown} />
          {/* USER_FLOW É6.4 : l'archivage est toujours proposé avant la suppression. */}
          <div className="flex items-center gap-2 border-t border-border pt-3">
            {statut === "actif" ? (
              <ConfirmDialog
                trigger={<Button size="sm" variant="secondary" label="Archiver le chapitre" />}
                title="Archiver ce chapitre ?"
                description="Le chapitre sort de la file du jour et de la génération paresseuse des rubriques. Réversible à tout moment ; tout l'historique est conservé."
                confirmLabel="Archiver"
                action={archiveChapterAction.bind(null, chapterId)}
              />
            ) : (
              <form action={unarchiveChapterAction.bind(null, chapterId)}>
                <Button size="sm" variant="secondary" type="submit" label="Désarchiver le chapitre" />
              </form>
            )}
            <StrongConfirmDialog
              trigger={<Button size="sm" variant="destructive" label="Supprimer le chapitre" />}
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
              <Banner
                status="warning"
                title="Pense à reporter cette modification dans ton Google Doc"
                description="Sinon elle sera écrasée au prochain ré-import."
              />
              <CourseEditor initialMarkdown={initialMarkdown} onChange={setMarkdown} />
            </>
          ) : (
            <>
              <p className="text-sm text-secondary">
                Google Docs → Fichier → Télécharger → Markdown (.md). Upload du fichier ou
                collage direct — mêmes règles de validation qu&apos;un import.
              </p>
              <FileInput
                label="Fichier Markdown"
                isLabelHidden
                accept=".md,text/markdown"
                value={null}
                onChange={handleFileUpload}
              />
              <TextArea
                label="Nouveau contenu Markdown"
                isLabelHidden
                rows={16}
                value={markdown}
                onChange={setMarkdown}
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
            <Button variant="ghost" label="Annuler" onClick={() => enterMode("vue")} />
            <Button
              label={simulating ? "Analyse…" : mode === "reimport" ? "Analyser le ré-import" : "Sauvegarder"}
              onClick={handleSave}
              isDisabled={simulating || !markdown.trim() || !allAcknowledged}
            />
            {!allAcknowledged && anomalies.length > 0 && (
              <p className="text-sm text-secondary">Acquitte les anomalies avant de sauvegarder.</p>
            )}
          </div>

          {simState && "error" in simState && <p className="text-sm text-error">{simState.error}</p>}
          {simState?.success && !simState.simulation.changed && (
            <p className="text-sm text-secondary">Aucun changement.</p>
          )}
          {simState?.success && simState.simulation.changed && (
            <ConsequencesDialog
              trigger={
                <Button
                  label={mode === "reimport" ? "Confirmer le ré-import" : "Voir les conséquences et confirmer"}
                />
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
