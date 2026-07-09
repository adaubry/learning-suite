"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  createSubjectAction,
  updateSubjectAction,
  archiveSubjectAction,
  unarchiveSubjectAction,
  generateRubricAction,
  createManualRubricAction,
} from "../actions";

type Subject = {
  id: string;
  nom: string;
  semestre: string;
  dateExamen: string | null;
  statut: "active" | "archivee";
  methodologieTitres: string | null;
};

type SectionStatut =
  | "importee"
  | "a_trier"
  | "active"
  | "exclue"
  | "rubrique_a_valider"
  | "prete"
  | "validee"
  | "en_revision"
  | "archivee";

type Section = {
  id: string;
  titre: string;
  importance: number;
  statut: SectionStatut;
};

type Chapter = {
  id: string;
  titre: string;
  version: number;
  statut: "actif" | "archive";
  sections: Section[];
};

const sectionStatutLabel: Record<SectionStatut, string> = {
  importee: "importée",
  a_trier: "à trier",
  active: "active",
  exclue: "exclue",
  rubrique_a_valider: "rubrique à valider",
  prete: "prête",
  validee: "validée",
  en_revision: "en révision",
  archivee: "archivée",
};

function SectionRow({ section }: { section: Section }) {
  const [genState, genAction, genPending] = useActionState(generateRubricAction, undefined);
  const [manState, manAction, manPending] = useActionState(createManualRubricAction, undefined);
  const error = genState?.error ?? manState?.error;
  // Les deux boutons créent une rubrique pour la MÊME section — un double-clic
  // générer+rédiger manuellement viole la contrainte d'unicité en base (une
  // rubrique non-obsolète par section, même classe de bug que
  // correction-view.tsx). L'appelant l'attrape proprement (pas de crash), mais
  // autant l'empêcher côté UI plutôt que de laisser partir une requête inutile.
  const submitting = genPending || manPending;

  return (
    <li className="flex flex-col gap-1 border-l pl-2 py-1 text-sm">
      <div className="flex items-center gap-2">
        <span>{section.titre}</span>
        <Badge variant="secondary">imp. {section.importance}</Badge>
        <Badge variant="outline">{sectionStatutLabel[section.statut]}</Badge>
      </div>
      {section.statut === "active" && (
        <div className="flex gap-2">
          <form action={genAction}>
            <input type="hidden" name="sectionId" value={section.id} />
            <Button type="submit" size="sm" variant="outline" disabled={submitting}>
              {genPending ? "Génération…" : "Générer la rubrique"}
            </Button>
          </form>
          <form action={manAction}>
            <input type="hidden" name="sectionId" value={section.id} />
            <Button type="submit" size="sm" variant="ghost" disabled={submitting}>
              Rédiger manuellement
            </Button>
          </form>
        </div>
      )}
      {section.statut === "rubrique_a_valider" && (
        <Button size="sm" nativeButton={false} render={<Link href={`/section/${section.id}/rubrique`} />}>
          Valider la rubrique
        </Button>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </li>
  );
}

export function AddSubjectForm() {
  const [state, action, pending] = useActionState(createSubjectAction, undefined);

  return (
    <form action={action} className="flex flex-col gap-3 rounded border p-4">
      <h2 className="text-sm font-semibold">Ajouter une matière</h2>
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="nom">Nom</Label>
          <Input id="nom" name="nom" required placeholder="Droit civil" />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="semestre">Semestre</Label>
          <Input id="semestre" name="semestre" required placeholder="S1" />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="dateExamen">Date d&apos;examen</Label>
          <Input id="dateExamen" name="dateExamen" type="date" />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Ajout…" : "Ajouter"}
      </Button>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}

export function SubjectCard({ subject, chapters }: { subject: Subject; chapters: Chapter[] }) {
  const [state, action, pending] = useActionState(updateSubjectAction, undefined);

  return (
    <div className="flex flex-col gap-4 rounded border p-4">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold">{subject.nom}</h3>
        <Badge variant="secondary">{subject.semestre}</Badge>
        {subject.statut === "archivee" && <Badge variant="outline">archivée</Badge>}
      </div>

      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="subjectId" value={subject.id} />
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <Label>Nom</Label>
            <Input name="nom" defaultValue={subject.nom} required />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <Label>Semestre</Label>
            <Input name="semestre" defaultValue={subject.semestre} required />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <Label>Date d&apos;examen</Label>
            <Input name="dateExamen" type="date" defaultValue={subject.dateExamen ?? ""} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label>Surcharge méthodologie des titres (optionnelle)</Label>
          <Textarea
            name="methodologieTitres"
            rows={3}
            defaultValue={subject.methodologieTitres ?? ""}
            placeholder="Laisser vide pour utiliser la méthodologie globale"
          />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        </div>
      </form>

      <div className="flex flex-col gap-2 border-t pt-3">
        {chapters.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun chapitre pour l&apos;instant.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {chapters.map((c) => (
              <li key={c.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-sm">
                  <span>{c.titre}</span>
                  <Badge variant="secondary">v{c.version}</Badge>
                  {c.statut === "archive" && <Badge variant="outline">archivé</Badge>}
                </div>
                {c.sections.length > 0 && (
                  <ul className="flex flex-col">
                    {c.sections.map((s) => (
                      <SectionRow key={s.id} section={s} />
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        <form action={subject.statut === "active" ? archiveSubjectAction : unarchiveSubjectAction}>
          <input type="hidden" name="subjectId" value={subject.id} />
          <Button type="submit" variant="outline" size="sm">
            {subject.statut === "active" ? "Archiver" : "Désarchiver"}
          </Button>
        </form>
      </div>
    </div>
  );
}
