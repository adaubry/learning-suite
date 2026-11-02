"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Selector } from "@astryxdesign/core/Selector";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import type { ApercuImport } from "@/services/fiche";
import { AddSubjectDialog } from "../curriculum/curriculum-ui";
import { importSetAction, previewImportAction, reimportSetAction } from "./actions";

// Import d'un set de fiches (USER_FLOW.md v2) : document → aperçu → import.
// L'aperçu ne modifie rien ; le ré-import y montre le sort de chaque fiche.

const STATUT_LABEL = { inchangee: "inchangée", modifiee: "modifiée", nouvelle: "nouvelle" } as const;

function NouvelleMatiere() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-none border border-border p-4">
      <p className="text-sm text-secondary">Crée d&apos;abord la matière qui recevra ces fiches.</p>
      <AddSubjectDialog />
    </div>
  );
}

function Apercu({ apercu }: { apercu: ApercuImport }) {
  return (
    <div className="flex flex-col gap-3">
      {apercu.avertissements.map((a) => (
        <Banner key={a} status="warning" title={a} />
      ))}
      <ol className="flex flex-col divide-y divide-border border border-border">
        {apercu.fiches.map((f) => (
          <li key={`${f.numero}-${f.titre}`} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <span className="font-medium">
              {f.numero}. {f.titre}
            </span>
            <span className="text-secondary">{f.nbPoints} points</span>
            {f.statut && f.statut !== "inchangee" && <Badge variant="neutral" label={STATUT_LABEL[f.statut]} />}
            {f.avertissements.map((a) => (
              <Badge key={a} variant="warning" label={a} />
            ))}
          </li>
        ))}
      </ol>
      {apercu.retirees.length > 0 && (
        <Banner
          status="info"
          title={`${apercu.retirees.length} fiche(s) absente(s) du document seront archivées`}
          description={apercu.retirees.map((r) => `${r.numero}. ${r.titre}`).join(" · ")}
        />
      )}
    </div>
  );
}

export function ImportWizard({
  subjects,
  sets,
  initialSetId,
}: {
  subjects: { id: string; nom: string }[];
  sets: { id: string; label: string }[];
  initialSetId: string;
}) {
  const [mode, setMode] = useState<"nouveau" | "reimport">(initialSetId ? "reimport" : "nouveau");
  // Une matière créée depuis cet écran arrive après le premier rendu : la 1ʳᵉ
  // matière reste le choix par défaut tant que rien n'est sélectionné.
  const [choixMatiere, setSubjectId] = useState("");
  const subjectId = choixMatiere || subjects[0]?.id || "";
  const [setId, setSetId] = useState(initialSetId);
  const [titre, setTitre] = useState("");
  const [markdown, setMarkdown] = useState("");

  const [previewState, previewAction, previewing] = useActionState(previewImportAction, undefined);
  const [importState, importAction, importing] = useActionState(importSetAction, undefined);
  const [reimportState, reimportAction, reimporting] = useActionState(reimportSetAction, undefined);
  // L'aperçu affiché doit correspondre au document et à la cible actuels.
  const [apercuPour, setApercuPour] = useState<string | null>(null);
  const cle = `${mode}|${setId}|${markdown}`;
  const apercu = apercuPour === cle && previewState && "apercu" in previewState ? previewState.apercu : null;

  if (subjects.length === 0) return <NouvelleMatiere />;

  function handleFile(file: File | File[] | null) {
    if (!file || Array.isArray(file)) return;
    if (!titre) setTitre(file.name.replace(/\.(md|markdown|txt)$/i, ""));
    void file.text().then(setMarkdown);
  }

  const cibleOk = mode === "nouveau" ? Boolean(subjectId && titre.trim()) : Boolean(setId);
  const pending = importing || reimporting;
  const erreurImport = mode === "nouveau" ? importState?.error : reimportState?.error;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-none border border-border p-4">
        {sets.length > 0 && (
          <SegmentedControl label="Type d'import" value={mode} onChange={(v) => setMode(v as typeof mode)}>
            <SegmentedControlItem value="nouveau" label="Nouveau set" />
            <SegmentedControlItem value="reimport" label="Ré-importer un set" />
          </SegmentedControl>
        )}

        {mode === "nouveau" ? (
          <>
            <Selector
              label="Matière"
              value={subjectId}
              onChange={setSubjectId}
              options={subjects.map((s) => ({ value: s.id, label: s.nom }))}
            />
            <TextInput label="Titre du set" value={titre} onChange={setTitre} placeholder="Semaine 1 ADMIN" />
          </>
        ) : (
          <Selector
            label="Set à ré-importer"
            value={setId}
            onChange={setSetId}
            placeholder="Choisir un set"
            options={sets.map((s) => ({ value: s.id, label: s.label }))}
            description="Les fiches sont appariées par titre puis par numéro : l'historique de révision des fiches retrouvées est conservé."
          />
        )}

        <p className="text-sm text-secondary">
          Google Docs → Fichier → Télécharger → Markdown (.md). Dépose le fichier ou colle son contenu.
        </p>
        <FileInput label="Fichier Markdown" isLabelHidden accept=".md,text/markdown,text/plain" value={null} onChange={handleFile} />
        <TextArea
          label="Contenu Markdown"
          isLabelHidden
          rows={10}
          value={markdown}
          onChange={setMarkdown}
          placeholder="## 1. Titre de la fiche…"
        />

        <form
          action={(fd) => {
            setApercuPour(cle);
            previewAction(fd);
          }}
        >
          <input type="hidden" name="markdown" value={markdown} />
          <input type="hidden" name="setId" value={mode === "reimport" ? setId : ""} />
          <Button
            type="submit"
            label={previewing ? "Analyse…" : "Voir l'aperçu"}
            isDisabled={previewing || !markdown.trim() || !cibleOk}
          />
        </form>
        {apercuPour === cle && previewState && "error" in previewState && (
          <p className="text-sm text-error">{previewState.error}</p>
        )}
      </div>

      {apercu && (
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold">
            Aperçu — {apercu.fiches.length} fiche{apercu.fiches.length > 1 ? "s" : ""}
          </h2>
          <Apercu apercu={apercu} />
          <form action={mode === "nouveau" ? importAction : reimportAction} className="flex items-center gap-3">
            <input type="hidden" name="markdown" value={markdown} />
            <input type="hidden" name="subjectId" value={subjectId} />
            <input type="hidden" name="titre" value={titre} />
            <input type="hidden" name="setId" value={setId} />
            <Button type="submit" label={pending ? "Import…" : mode === "nouveau" ? "Importer" : "Ré-importer"} isDisabled={pending} />
            <Button variant="ghost" label="Annuler" href="/curriculum" as={Link} />
          </form>
          {erreurImport && <p className="text-sm text-error">{erreurImport}</p>}
        </div>
      )}
    </div>
  );
}
