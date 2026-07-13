"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Selector } from "@astryxdesign/core/Selector";
import { MarkdownViewer } from "@/components/markdown-viewer";
import { AnomalyPanel } from "@/components/anomaly-panel";
import { TriageList } from "@/components/triage-list";
import type { Anomaly } from "@/core/parser/types";
import { anomalyKey } from "@/core/parser/validateDocument";
import {
  analyzeChapterAction,
  applyTriageAction,
  importChapterAction,
  proposeSectioningAction,
} from "./actions";

// U23 ImportWizard (FUNCTIONS §6.2) — étapes É1.0–É1.4 de USER_FLOW P1.
// Étape dans searchParams (TECH_MAPPING §4.3, reprise gratuite par URL).

type Step = "destination" | "import" | "rapport" | "sectionnement" | "tri";

export function ImportWizard({ subjects }: { subjects: { id: string; nom: string }[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const step = (searchParams.get("step") as Step) || "destination";
  const chapterId = searchParams.get("chapterId") ?? "";

  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [titre, setTitre] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());

  const [analyzeState, analyzeAction, analyzing] = useActionState(analyzeChapterAction, undefined);
  const [importState, importAction, importing] = useActionState(importChapterAction, undefined);
  const [proposeState, proposeAction] = useActionState(proposeSectioningAction, undefined);

  const anomalies: Anomaly[] = analyzeState?.success ? analyzeState.anomalies : [];

  function triggerPropose() {
    const fd = new FormData();
    fd.set("chapterId", chapterId);
    startTransition(() => proposeAction(fd));
  }

  // ponytail: un rechargement en pleine étape "rapport" perd le markdown et
  // l'analyse (état en mémoire, pas de persistance au-delà de l'étape en URL
  // — TECH_MAPPING §4.3) ; on renvoie vers "import" plutôt que d'afficher un
  // rapport vide.
  useEffect(() => {
    if (step === "rapport" && !analyzeState) {
      router.replace("/importer?step=import");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // É1.3 : l'arrivée sur l'écran de sectionnement déclenche S2.propose (écran
  // d'attente dédié, USER_FLOW É1.3 — pas le bouton d'import, DECISIONS.md bloc 3.3).
  // `sectioningFiredRef` : un appel LLM de cet écran dure plusieurs minutes (modèle
  // de raisonnement) — le double-appel de useEffect en dev (StrictMode) déclencherait
  // deux appels concurrents avant que l'état `pending` ne se propage ; le ref bloque
  // dès le premier montage, indépendamment du re-render.
  const sectioningFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (step === "sectionnement" && chapterId && sectioningFiredRef.current !== chapterId) {
      sectioningFiredRef.current = chapterId;
      triggerPropose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, chapterId]);

  // même repli qu'à l'étape "rapport" : un rechargement à l'étape "tri" perd le
  // résultat du sectionnement en mémoire — on relance depuis l'écran d'attente.
  useEffect(() => {
    if (step === "tri" && !proposeState?.success) {
      router.replace(chapterId ? `/importer?step=sectionnement&chapterId=${chapterId}` : "/importer");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function goToStep(next: Step) {
    router.replace(`/importer?step=${next}`);
  }

  function handleFileUpload(file: File | File[] | null) {
    if (!file || Array.isArray(file)) return;
    void file.text().then(setMarkdown);
  }

  const allAcknowledged = anomalies.every((a) => acknowledged.has(anomalyKey(a)));

  return (
    <div className="flex flex-col gap-6">
      {step === "destination" && (
        <div className="flex flex-col gap-4 rounded border border-border p-4">
          <h2 className="text-sm font-semibold">1. Destination</h2>
          {subjects.length === 0 ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-secondary">
                Crée d&apos;abord une matière.
              </p>
              <Button size="sm" label="Créer une matière" href="/curriculum" as={Link} />
            </div>
          ) : (
            <>
              <Selector
                label="Matière"
                value={subjectId}
                onChange={setSubjectId}
                options={subjects.map((s) => ({ value: s.id, label: s.nom }))}
              />
              <TextInput
                label="Titre du chapitre"
                value={titre}
                onChange={setTitre}
                placeholder="Introduction au droit des obligations"
              />
              <Button
                type="button"
                className="self-start"
                label="Continuer"
                isDisabled={!subjectId || !titre.trim()}
                onClick={() => goToStep("import")}
              />
            </>
          )}
        </div>
      )}

      {step === "import" && (
        <form
          action={(formData) => {
            analyzeAction(formData);
            goToStep("rapport");
          }}
          className="flex flex-col gap-4 rounded border border-border p-4"
        >
          <h2 className="text-sm font-semibold">2. Import du Markdown</h2>
          <p className="text-sm text-secondary">
            Google Docs → Fichier → Télécharger → Markdown (.md). Upload du fichier ou collage
            direct.
          </p>
          <FileInput label="Fichier Markdown" isLabelHidden accept=".md,text/markdown" value={null} onChange={handleFileUpload} />
          <TextArea
            label="Contenu Markdown"
            isLabelHidden
            htmlName="markdown"
            rows={12}
            value={markdown}
            onChange={setMarkdown}
            placeholder="Colle ici le contenu Markdown exporté depuis Google Docs…"
          />
          <div className="flex items-center gap-3">
            <Button type="button" variant="secondary" label="Retour" onClick={() => goToStep("destination")} />
            <Button type="submit" label={analyzing ? "Analyse…" : "Analyser"} isDisabled={analyzing || !markdown.trim()} />
          </div>
          {analyzeState?.error && <p className="text-sm text-error">{analyzeState.error}</p>}
        </form>
      )}

      {step === "rapport" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">3. Rapport de validation</h2>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isDisabled
              label="Corriger le texte"
              tooltip="Éditeur WYSIWYG (U4/Tiptap) — Phase 8, pas encore construit : recolle un markdown corrigé à l'étape précédente."
            />
          </div>
          {!analyzeState?.success ? (
            <p className="text-sm text-secondary">Analyse en cours…</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="max-h-[32rem] overflow-y-auto rounded border border-border p-4">
                  <MarkdownViewer markdown={markdown} />
                </div>
                <div className="max-h-[32rem] overflow-y-auto">
                  <AnomalyPanel
                    anomalies={anomalies}
                    acknowledged={acknowledged}
                    onAcknowledge={(key) =>
                      setAcknowledged((prev) => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      })
                    }
                    onAcknowledgeAll={() =>
                      setAcknowledged(new Set(anomalies.map(anomalyKey)))
                    }
                  />
                </div>
              </div>

              <form action={importAction} className="flex items-center gap-3 border-t border-border pt-4">
                <input type="hidden" name="subjectId" value={subjectId} />
                <input type="hidden" name="titre" value={titre} />
                <input type="hidden" name="markdown" value={markdown} />
                <input
                  type="hidden"
                  name="acknowledgedAnomalyKeys"
                  value={JSON.stringify(Array.from(acknowledged))}
                />
                <Button type="button" variant="secondary" label="Retour" onClick={() => goToStep("import")} />
                <Button type="submit" label={importing ? "Import…" : "Valider l'import"} isDisabled={!allAcknowledged || importing} />
                {importState?.error && (
                  <p className="text-sm text-error">{importState.error}</p>
                )}
              </form>
            </>
          )}
        </div>
      )}

      {step === "sectionnement" && (
        <div className="flex flex-col gap-4 rounded border border-border p-4">
          <h2 className="text-sm font-semibold">4. Sectionnement</h2>
          {!proposeState && (
            <p className="text-sm text-secondary">
              Proposition d&apos;un sectionnement pédagogique en cours…
            </p>
          )}
          {proposeState?.error && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-error">{proposeState.error}</p>
              <Button type="button" variant="secondary" className="self-start" label="Relancer" onClick={triggerPropose} />
            </div>
          )}
          {proposeState?.success && (
            <>
              {proposeState.method === "mecanique" && (
                <div className="flex flex-col items-start gap-2 rounded bg-muted p-2">
                  <p className="text-sm text-secondary">
                    L&apos;IA n&apos;a pas pu proposer de sectionnement : un découpage mécanique par
                    titres a été utilisé. Tu peux le retrier ci-après, ou réessayer l&apos;IA.
                  </p>
                  <Button type="button" size="sm" variant="secondary" label="Réessayer avec l'IA" onClick={triggerPropose} />
                </div>
              )}
              <ul className="flex flex-col gap-1 text-sm">
                {proposeState.sections.map((s) => (
                  <li key={s.id} className="rounded border border-border px-2 py-1">
                    {s.titre}
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                className="self-start"
                label="Passer au tri"
                onClick={() => router.replace(`/importer?step=tri&chapterId=${chapterId}`)}
              />
            </>
          )}
        </div>
      )}

      {step === "tri" && proposeState?.success && (
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold">5. Tri des sections</h2>
          <TriageList
            chapterId={chapterId}
            sections={proposeState.sections.map((s) => ({
              id: s.id,
              titre: s.titre,
              importance: s.importance,
              contenu: s.contenu,
            }))}
            action={applyTriageAction}
          />
        </div>
      )}
    </div>
  );
}
