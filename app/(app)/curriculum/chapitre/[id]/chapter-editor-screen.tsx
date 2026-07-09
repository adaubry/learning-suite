"use client";

import { useActionState, useEffect, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownViewer } from "@/components/markdown-viewer";
import { CourseEditor } from "@/components/course-editor";
import { AnomalyPanel } from "@/components/anomaly-panel";
import { ConsequencesDialog } from "@/components/consequences-dialog";
import { parseChapter } from "@/core/parser/parseChapter";
import { validateDocument, anomalyKey } from "@/core/parser/validateDocument";
import type { Anomaly } from "@/core/parser/types";
import { simulateUpdateAction, commitUpdateAction } from "./actions";

// É6.1 (vue minimale) → É6.2 (éditeur intégré, Bloc 8.3) → É6.3 (ré-import, Bloc 8.4). Les deux
// portes partagent le même pipeline S1.simulateUpdate/commitUpdate (ARCHITECTURE §7) — seule la
// façon d'obtenir le nouveau markdown change (édition WYSIWYG vs upload/collage brut, mêmes
// règles qu'É1.1). Les autres actions du catalogue É6.1 (re-trier = déjà accessible depuis
// /importer, générer en lot/archiver/supprimer = Bloc 9.1) ne sont pas construites ici.

type Mode = "vue" | "edition" | "reimport";

export function ChapterEditorScreen({
  chapterId,
  titre,
  initialMarkdown,
}: {
  chapterId: string;
  titre: string;
  initialMarkdown: string;
}) {
  const [mode, setMode] = useState<Mode>("vue");
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [simState, simAction, simulating] = useActionState(simulateUpdateAction, undefined);

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
    simAction(fd);
  }

  function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    void file.text().then(setMarkdown);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{titre}</h1>
        {mode === "vue" && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => enterMode("reimport")}>
              Ré-importer depuis Google Docs
            </Button>
            <Button size="sm" onClick={() => enterMode("edition")}>
              Modifier dans l&apos;app
            </Button>
          </div>
        )}
      </div>

      {mode === "vue" && <MarkdownViewer markdown={initialMarkdown} />}

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
