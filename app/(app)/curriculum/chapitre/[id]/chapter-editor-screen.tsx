"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { MarkdownViewer } from "@/components/markdown-viewer";
import { CourseEditor } from "@/components/course-editor";
import { AnomalyPanel } from "@/components/anomaly-panel";
import { ConsequencesDialog } from "@/components/consequences-dialog";
import { parseChapter } from "@/core/parser/parseChapter";
import { validateDocument, anomalyKey } from "@/core/parser/validateDocument";
import type { Anomaly } from "@/core/parser/types";
import { simulateUpdateAction, commitUpdateAction } from "./actions";

// É6.1 (vue minimale) → É6.2 (éditeur intégré, Bloc 8.3). Les autres actions du catalogue É6.1
// (ré-importer = Bloc 8.4, re-trier = déjà accessible depuis /importer, générer en lot/
// archiver/supprimer = Bloc 9.1) ne sont pas construites ici — tranché en récitation.

export function ChapterEditorScreen({
  chapterId,
  titre,
  initialMarkdown,
}: {
  chapterId: string;
  titre: string;
  initialMarkdown: string;
}) {
  const [editing, setEditing] = useState(false);
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [simState, simAction, simulating] = useActionState(simulateUpdateAction, undefined);

  // Validation continue de la hiérarchie (P2, USER_FLOW É6.2) — débouncée : un remark-parse
  // par caractère tapé sur un chapitre de plusieurs dizaines de Ko serait perceptible.
  useEffect(() => {
    const timeout = setTimeout(() => {
      const parsed = parseChapter(markdown);
      setAnomalies(validateDocument(parsed, markdown));
    }, 300);
    return () => clearTimeout(timeout);
  }, [markdown]);

  const allAcknowledged = anomalies.every((a) => acknowledged.has(anomalyKey(a)));

  function handleSave() {
    const fd = new FormData();
    fd.set("chapterId", chapterId);
    fd.set("markdown", markdown);
    simAction(fd);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{titre}</h1>
        {!editing && (
          <Button size="sm" onClick={() => setEditing(true)}>
            Modifier dans l&apos;app
          </Button>
        )}
      </div>

      {!editing ? (
        <MarkdownViewer markdown={initialMarkdown} />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="rounded border border-amber-400 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Pense à reporter cette modification dans ton Google Doc, sinon elle sera écrasée au
            prochain ré-import.
          </p>

          <CourseEditor initialMarkdown={initialMarkdown} onChange={setMarkdown} />

          {anomalies.length > 0 && (
            <AnomalyPanel
              anomalies={anomalies}
              acknowledged={acknowledged}
              onAcknowledge={(key) => setAcknowledged((prev) => new Set(prev).add(key))}
              onAcknowledgeAll={() => setAcknowledged(new Set(anomalies.map(anomalyKey)))}
            />
          )}

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={simulating || !allAcknowledged}>
              {simulating ? "Analyse…" : "Sauvegarder"}
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
              trigger={<Button>Voir les conséquences et confirmer</Button>}
              simulation={simState.simulation}
              action={commitUpdateAction.bind(null, chapterId, simState.markdown, Array.from(acknowledged))}
            />
          )}
        </div>
      )}
    </div>
  );
}
