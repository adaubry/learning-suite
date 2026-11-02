"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Selector } from "@astryxdesign/core/Selector";
import { TextArea } from "@astryxdesign/core/TextArea";
import { MarkdownViewer } from "@/components/markdown-viewer";
import { FsrsRatingBar } from "@/components/fsrs-rating-bar";
import { bilanAutoEvaluation, type ErreurType, type Verdict } from "@/core/fiche/verdict";
import type { PointFiche } from "@/core/fiche/extractPoints";
import type { Note } from "@/core/fsrs/fsrsCore";

// ComparaisonView (ARCHITECTURE.md v2 §2) — auto-évaluation : la restitution et
// la fiche côte à côte, les points de la fiche à cocher, puis la sortie :
// tentative 1 → [Relire puis refaire] ou noter ; tentative 2 → noter (rappel du
// bilan de la 1ʳᵉ passe, à froid, pour éclairer la note).
// Le bilan se recalcule à chaque case ; s'il manque un point essentiel, la
// relecture est mise en avant, l'étudiant décide.

const NOTES: Note[] = ["again", "hard", "good", "easy"];

const TYPE_LABEL: Record<ErreurType, string> = {
  omission: "Oubli",
  deformation: "Déformation",
  confusion: "Confusion",
  imprecision: "Imprécision",
};

type AddErrorAction = (
  prevState: unknown,
  formData: FormData,
) => Promise<{ ok: true } | { error: string } | undefined>;

// Consigner une erreur au carnet, sans quitter l'écran.
function AjoutCarnet({
  tentativeId,
  point,
  coche,
  action,
}: {
  tentativeId: string;
  point: PointFiche;
  coche: boolean;
  action: AddErrorAction;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [type, setType] = useState<ErreurType>(coche ? "imprecision" : "omission");
  const [description, setDescription] = useState(`${point.intitule} : ${point.attendu}`);

  if (state && "ok" in state) return <span className="text-xs text-success">Ajouté au carnet ✓</span>;

  return (
    <details className="text-sm">
      <summary className="cursor-pointer select-none text-xs text-secondary">Au carnet d&apos;erreurs</summary>
      <form action={formAction} className="mt-2 flex flex-col gap-2">
        <input type="hidden" name="tentativeId" value={tentativeId} />
        <Selector
          label="Type"
          size="sm"
          htmlName="type"
          value={type}
          onChange={(v) => setType(v as ErreurType)}
          options={(Object.keys(TYPE_LABEL) as ErreurType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
        />
        <TextArea label="Ce que tu as raté" htmlName="description" rows={2} value={description} onChange={setDescription} />
        <Button type="submit" size="sm" variant="secondary" className="self-start" isDisabled={pending} label="Ajouter" />
        {state && "error" in state && <p className="text-xs text-error">{state.error}</p>}
      </form>
    </details>
  );
}

export function ComparaisonView({
  ficheTitre,
  tentativeId,
  numero,
  input,
  contenu,
  points,
  erreursConnues,
  verdictPremierePasse,
  preview,
  relireAction,
  noterAction,
  abandonAction,
  addErrorAction,
}: {
  ficheTitre: string;
  tentativeId: string;
  numero: number;
  input: string;
  contenu: string;
  points: PointFiche[];
  erreursConnues: { type: string; description: string; occurrences: number }[];
  verdictPremierePasse: Verdict | null;
  preview: Record<Note, { due: string }>;
  /** Tentative 1 seulement. */
  relireAction?: (formData: FormData) => Promise<void>;
  noterAction: (note: Note, formData: FormData) => Promise<void>;
  abandonAction: () => Promise<void>;
  addErrorAction: AddErrorAction;
}) {
  // Les sorties sont des <form> indépendants qui mutent le même cycle : verrou commun.
  const [submitting, setSubmitting] = useState(false);
  const lockSubmit = () => setSubmitting(true);

  const [coches, setCoches] = useState<Set<number>>(new Set());
  const cochesField = JSON.stringify([...coches]);
  const bilan = useMemo(() => bilanAutoEvaluation(points, [...coches]), [points, coches]);
  const relirePrimaire = bilan.verdict === "insuffisant" && Boolean(relireAction);

  const basculer = (i: number, valeur: boolean) =>
    setCoches((prev) => {
      const next = new Set(prev);
      if (valeur) next.add(i);
      else next.delete(i);
      return next;
    });

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 xl:mx-auto xl:w-full xl:max-w-[86rem]">
        <h1 className="text-lg font-semibold">{ficheTitre}</h1>
        <Badge variant="neutral" label={`tentative n°${numero}`} />
      </div>

      <div className="flex flex-col gap-6 xl:mx-auto xl:grid xl:w-full xl:max-w-[86rem] xl:grid-cols-2">
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2 rounded-none border border-border p-3">
            <h2 className="text-sm font-semibold">Ta restitution</h2>
            <p className="whitespace-pre-wrap text-sm">{input}</p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Coche ce que tu as restitué</h2>
            <ul className="flex flex-col divide-y divide-border border border-border">
              {points.map((p, i) => (
                <li key={i} className="flex flex-col gap-1 p-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <CheckboxInput
                      label={p.intitule}
                      description={p.attendu}
                      value={coches.has(i)}
                      onChange={(v) => basculer(i, v)}
                    />
                    {p.type === "critique" && <Badge variant="warning" label="essentiel" />}
                    {p.raisonnement && <Badge variant="neutral" label="raisonnement" />}
                  </div>
                  <AjoutCarnet tentativeId={tentativeId} point={p} coche={coches.has(i)} action={addErrorAction} />
                </li>
              ))}
            </ul>
          </section>

          {erreursConnues.length > 0 && (
            <section className="flex flex-col gap-1 text-sm">
              <h2 className="font-semibold">Tes erreurs déjà relevées sur cette fiche</h2>
              <ul className="list-disc pl-5 text-secondary">
                {erreursConnues.map((e, i) => (
                  <li key={i}>
                    {e.description}
                    {e.occurrences > 1 ? ` (×${e.occurrences})` : ""}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <section className="flex flex-col gap-2 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:self-start xl:overflow-y-auto">
          <h2 className="text-sm font-semibold">La fiche</h2>
          <div className="rounded-none border border-border p-4">
            <MarkdownViewer markdown={contenu} className="font-serif" />
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4 xl:mx-auto xl:w-full xl:max-w-[86rem]">
        <Banner
          status={bilan.verdict === "bon" ? "success" : "warning"}
          title={bilan.verdict === "bon" ? "L'essentiel y est" : "Il manque un point essentiel"}
          description={`${bilan.points.couverts}/${bilan.points.total} points · essentiels ${bilan.essentiels.couverts}/${bilan.essentiels.total}${
            bilan.raisonnement.total ? ` · raisonnement ${bilan.raisonnement.couverts}/${bilan.raisonnement.total}` : ""
          }`}
        />
        {relireAction && (
          <form action={relireAction} onSubmit={lockSubmit}>
            <input type="hidden" name="coches" value={cochesField} />
            <Button
              type="submit"
              variant={relirePrimaire ? "primary" : "secondary"}
              isDisabled={submitting}
              label="Relire la fiche, puis refaire un blurting"
            />
          </form>
        )}
        <p className="text-sm font-medium">
          À quel point c&apos;était difficile de t&apos;en souvenir ?
          {verdictPremierePasse && (
            <span className="block font-normal text-secondary">
              Note ton rappel à froid : à la 1ʳᵉ passe,{" "}
              {verdictPremierePasse === "bon" ? "l'essentiel y était" : "il manquait un point essentiel"}.
            </span>
          )}
        </p>
        <FsrsRatingBar
          notes={NOTES}
          preview={preview}
          rateAction={noterAction}
          hiddenFields={{ coches: cochesField }}
          disabled={submitting}
          onSubmit={lockSubmit}
        />
        <form action={abandonAction} onSubmit={lockSubmit}>
          <Button type="submit" variant="ghost" size="sm" isDisabled={submitting} label="Abandonner" />
        </form>
      </div>
    </div>
  );
}
