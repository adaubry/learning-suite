"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    void file.text().then(setMarkdown);
  }

  const allAcknowledged = anomalies.every((a) => acknowledged.has(anomalyKey(a)));

  return (
    <div className="flex flex-col gap-6">
      {step === "destination" && (
        <div className="flex flex-col gap-4 rounded border p-4">
          <h2 className="text-sm font-semibold">1. Destination</h2>
          {subjects.length === 0 ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-muted-foreground">
                Crée d&apos;abord une matière.
              </p>
              <Button size="sm" nativeButton={false} render={<Link href="/curriculum" />}>
                Créer une matière
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <Label htmlFor="subjectId">Matière</Label>
                <select
                  id="subjectId"
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="titre">Titre du chapitre</Label>
                <Input
                  id="titre"
                  value={titre}
                  onChange={(e) => setTitre(e.target.value)}
                  placeholder="Introduction au droit des obligations"
                />
              </div>
              <Button
                type="button"
                disabled={!subjectId || !titre.trim()}
                onClick={() => goToStep("import")}
                className="self-start"
              >
                Continuer
              </Button>
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
          className="flex flex-col gap-4 rounded border p-4"
        >
          <h2 className="text-sm font-semibold">2. Import du Markdown</h2>
          <p className="text-sm text-muted-foreground">
            Google Docs → Fichier → Télécharger → Markdown (.md). Upload du fichier ou collage
            direct.
          </p>
          <Input type="file" accept=".md,text/markdown" onChange={handleFileUpload} />
          <Textarea
            name="markdown"
            rows={12}
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder="Colle ici le contenu Markdown exporté depuis Google Docs…"
          />
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={() => goToStep("destination")}>
              Retour
            </Button>
            <Button type="submit" disabled={analyzing || !markdown.trim()}>
              {analyzing ? "Analyse…" : "Analyser"}
            </Button>
          </div>
          {analyzeState?.error && <p className="text-sm text-destructive">{analyzeState.error}</p>}
        </form>
      )}

      {step === "rapport" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">3. Rapport de validation</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled
              title="Éditeur WYSIWYG (U4/Tiptap) — Phase 8, pas encore construit : recolle un markdown corrigé à l'étape précédente."
            >
              Corriger le texte
            </Button>
          </div>
          {!analyzeState?.success ? (
            <p className="text-sm text-muted-foreground">Analyse en cours…</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="max-h-[32rem] overflow-y-auto rounded border p-4">
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

              <form action={importAction} className="flex items-center gap-3 border-t pt-4">
                <input type="hidden" name="subjectId" value={subjectId} />
                <input type="hidden" name="titre" value={titre} />
                <input type="hidden" name="markdown" value={markdown} />
                <input
                  type="hidden"
                  name="acknowledgedAnomalyKeys"
                  value={JSON.stringify(Array.from(acknowledged))}
                />
                <Button type="button" variant="outline" onClick={() => goToStep("import")}>
                  Retour
                </Button>
                <Button type="submit" disabled={!allAcknowledged || importing}>
                  {importing ? "Import…" : "Valider l'import"}
                </Button>
                {importState?.error && (
                  <p className="text-sm text-destructive">{importState.error}</p>
                )}
              </form>
            </>
          )}
        </div>
      )}

      {step === "sectionnement" && (
        <div className="flex flex-col gap-4 rounded border p-4">
          <h2 className="text-sm font-semibold">4. Sectionnement</h2>
          {!proposeState && (
            <p className="text-sm text-muted-foreground">
              Proposition d&apos;un sectionnement pédagogique en cours…
            </p>
          )}
          {proposeState?.error && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-destructive">{proposeState.error}</p>
              <Button
                type="button"
                variant="outline"
                className="self-start"
                onClick={triggerPropose}
              >
                Relancer
              </Button>
            </div>
          )}
          {proposeState?.success && (
            <>
              {proposeState.method === "mecanique" && (
                <div className="flex flex-col items-start gap-2 rounded bg-muted p-2">
                  <p className="text-sm text-muted-foreground">
                    L&apos;IA n&apos;a pas pu proposer de sectionnement : un découpage mécanique par
                    titres a été utilisé. Tu peux le retrier ci-après, ou réessayer l&apos;IA.
                  </p>
                  <Button type="button" size="sm" variant="outline" onClick={triggerPropose}>
                    Réessayer avec l&apos;IA
                  </Button>
                </div>
              )}
              <ul className="flex flex-col gap-1 text-sm">
                {proposeState.sections.map((s) => (
                  <li key={s.id} className="rounded border px-2 py-1">
                    {s.titre}
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                className="self-start"
                onClick={() => router.replace(`/importer?step=tri&chapterId=${chapterId}`)}
              >
                Passer au tri
              </Button>
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
