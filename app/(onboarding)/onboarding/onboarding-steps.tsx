"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  createSubjectAction,
  updatePlannerConfigAction,
  updateMethodologieGlobaleAction,
  finishOnboardingAction,
} from "../../(app)/actions";

type Subject = { id: string; nom: string; semestre: string };

export function StepMatieres({ subjects }: { subjects: Subject[] }) {
  const [state, action, pending] = useActionState(createSubjectAction, undefined);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Vos matières</h2>
        <p className="text-sm text-muted-foreground">
          Créez au moins une matière pour continuer. La date d&apos;examen pilote les
          priorités — optionnelle mais fortement suggérée.
        </p>
      </div>

      {subjects.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {subjects.map((s) => (
            <li key={s.id} className="rounded border px-3 py-2">
              {s.nom} — {s.semestre}
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="flex flex-col gap-3 rounded border p-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="nom">Nom</Label>
          <Input id="nom" name="nom" required placeholder="Droit civil" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="semestre">Semestre</Label>
          <Input id="semestre" name="semestre" required placeholder="S1" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="dateExamen">Date d&apos;examen (optionnelle)</Label>
          <Input id="dateExamen" name="dateExamen" type="date" />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Ajout…" : "Ajouter une matière"}
        </Button>
        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      </form>

      {subjects.length > 0 ? (
        <Button nativeButton={false} render={<Link href="/onboarding?step=2" />}>Suivant</Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          Ajoutez une matière pour débloquer la suite.
        </p>
      )}
    </div>
  );
}

export function StepRythme({ nouvellesParJour }: { nouvellesParJour: number }) {
  const [state, action, pending] = useActionState(updatePlannerConfigAction, undefined);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Votre rythme</h2>
        <p className="text-sm text-muted-foreground">
          Nombre de nouvelles sections proposées par jour — ce plafond protège contre
          l&apos;auto-surcharge, modifiable à tout moment.
        </p>
      </div>

      <form action={action} className="flex flex-col gap-4">
        <SliderField defaultValue={nouvellesParJour} />
        <div className="flex gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Enregistrement…" : "Suivant"}
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/onboarding?step=3" />}>
            Passer (garder {nouvellesParJour})
          </Button>
        </div>
        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        {state?.success && (
          <Link href="/onboarding?step=3" className="text-sm underline">
            Continuer →
          </Link>
        )}
      </form>
    </div>
  );
}

function SliderField({ defaultValue }: { defaultValue: number }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="nouvellesParJour">Nouvelles études par jour</Label>
      <Slider
        id="nouvellesParJour"
        name="nouvellesParJour"
        min={1}
        max={10}
        step={1}
        defaultValue={[defaultValue]}
      />
    </div>
  );
}

export function StepMethodologie({
  methodologieTitresGlobale,
}: {
  methodologieTitresGlobale: string | null;
}) {
  const [state, action, pending] = useActionState(updateMethodologieGlobaleAction, undefined);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Méthodologie des titres</h2>
        <p className="text-sm text-muted-foreground">
          Collez votre document de méthodologie des titres juridiques (utilisé pour le
          sectionnement). Surchargeable par matière depuis sa fiche. Étape skippable.
        </p>
      </div>

      <form action={action} className="flex flex-col gap-4">
        <Textarea
          name="methodologieTitresGlobale"
          rows={8}
          defaultValue={methodologieTitresGlobale ?? ""}
          placeholder="Ex : Titre 1 = partie, Titre 2 = chapitre, Titre 3 = section..."
        />
        <div className="flex gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Enregistrement…" : "Suivant"}
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/onboarding?step=4" />}>
            Passer
          </Button>
        </div>
        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
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
        <Button type="submit">Terminer</Button>
      </form>
    </div>
  );
}
