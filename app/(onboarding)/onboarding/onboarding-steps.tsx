"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { DateInput } from "@astryxdesign/core/DateInput";
import type { ISODateString } from "@astryxdesign/core/Calendar";
import { Slider } from "@astryxdesign/core/Slider";
import { TextArea } from "@astryxdesign/core/TextArea";
import {
  createSubjectAction,
  updatePlannerConfigAction,
  updateMethodologieGlobaleAction,
  finishOnboardingAction,
} from "../../(app)/actions";

type Subject = { id: string; nom: string; semestre: string };

export function StepMatieres({ subjects }: { subjects: Subject[] }) {
  const [state, action, pending] = useActionState(createSubjectAction, undefined);
  const [nom, setNom] = useState("");
  const [semestre, setSemestre] = useState("");
  const [dateExamen, setDateExamen] = useState<ISODateString | undefined>(undefined);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Vos matières</h2>
        <p className="text-sm text-secondary">
          Créez au moins une matière pour continuer. La date d&apos;examen pilote les
          priorités — optionnelle mais fortement suggérée.
        </p>
      </div>

      {subjects.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {subjects.map((s) => (
            <li key={s.id} className="rounded border border-border px-3 py-2">
              {s.nom} — {s.semestre}
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="flex flex-col gap-3 rounded border border-border p-4">
        <TextInput label="Nom" htmlName="nom" isRequired value={nom} onChange={setNom} placeholder="Droit civil" />
        <TextInput label="Semestre" htmlName="semestre" isRequired value={semestre} onChange={setSemestre} placeholder="S1" />
        <DateInput label="Date d'examen" isOptional value={dateExamen} onChange={setDateExamen} />
        <input type="hidden" name="dateExamen" value={dateExamen ?? ""} />
        <Button type="submit" className="self-start" isDisabled={pending} label={pending ? "Ajout…" : "Ajouter une matière"} />
        {state?.error && <p className="text-sm text-error">{state.error}</p>}
      </form>

      {subjects.length > 0 ? (
        <Button className="self-start" label="Suivant" href="/onboarding?step=2" as={Link} />
      ) : (
        <p className="text-sm text-secondary">
          Ajoutez une matière pour débloquer la suite.
        </p>
      )}
    </div>
  );
}

export function StepRythme({ nouvellesParJour }: { nouvellesParJour: number }) {
  const [state, action, pending] = useActionState(updatePlannerConfigAction, undefined);
  const [rythme, setRythme] = useState(nouvellesParJour);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Votre rythme</h2>
        <p className="text-sm text-secondary">
          Nombre de nouvelles sections proposées par jour — ce plafond protège contre
          l&apos;auto-surcharge, modifiable à tout moment.
        </p>
      </div>

      <form action={action} className="flex flex-col gap-4">
        <Slider
          label="Nouvelles études par jour"
          htmlName="nouvellesParJour"
          min={1}
          max={10}
          step={1}
          value={rythme}
          onChange={setRythme}
        />
        <div className="flex gap-3">
          <Button type="submit" isDisabled={pending} label={pending ? "Enregistrement…" : "Suivant"} />
          <Button variant="secondary" label={`Passer (garder ${nouvellesParJour})`} href="/onboarding?step=3" as={Link} />
        </div>
        {state?.error && <p className="text-sm text-error">{state.error}</p>}
        {state?.success && (
          <Link href="/onboarding?step=3" className="text-sm underline">
            Continuer →
          </Link>
        )}
      </form>
    </div>
  );
}

export function StepMethodologie({
  methodologieTitresGlobale,
}: {
  methodologieTitresGlobale: string | null;
}) {
  const [state, action, pending] = useActionState(updateMethodologieGlobaleAction, undefined);
  const [methodo, setMethodo] = useState(methodologieTitresGlobale ?? "");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Méthodologie des titres</h2>
        <p className="text-sm text-secondary">
          Collez votre document de méthodologie des titres juridiques (utilisé pour le
          sectionnement). Surchargeable par matière depuis sa fiche. Étape skippable.
        </p>
      </div>

      <form action={action} className="flex flex-col gap-4">
        <TextArea
          label="Méthodologie des titres"
          isLabelHidden
          htmlName="methodologieTitresGlobale"
          rows={8}
          value={methodo}
          onChange={setMethodo}
          placeholder="Ex : Titre 1 = partie, Titre 2 = chapitre, Titre 3 = section..."
        />
        <div className="flex gap-3">
          <Button type="submit" isDisabled={pending} label={pending ? "Enregistrement…" : "Suivant"} />
          <Button variant="secondary" label="Passer" href="/onboarding?step=4" as={Link} />
        </div>
        {state?.error && <p className="text-sm text-error">{state.error}</p>}
        {state?.success && (
          <Link href="/onboarding?step=4" className="text-sm underline">
            Continuer →
          </Link>
        )}
      </form>
    </div>
  );
}

export function StepRecap({
  subjects,
  nouvellesParJour,
  methodologieTitresGlobale,
}: {
  subjects: Subject[];
  nouvellesParJour: number;
  methodologieTitresGlobale: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Récapitulatif</h2>
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        <li>
          <strong>{subjects.length}</strong> matière(s) : {subjects.map((s) => s.nom).join(", ")}
        </li>
        <li>
          <strong>{nouvellesParJour}</strong> nouvelles études par jour
        </li>
        <li>
          Méthodologie des titres :{" "}
          {methodologieTitresGlobale ? "renseignée" : "non renseignée (ajustable plus tard)"}
        </li>
      </ul>
      <form action={finishOnboardingAction}>
        <input type="hidden" name="nouvellesParJour" value={nouvellesParJour} />
        <Button type="submit" label="Terminer" />
      </form>
    </div>
  );
}
