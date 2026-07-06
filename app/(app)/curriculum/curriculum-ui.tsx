"use client";

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
} from "../actions";

type Subject = {
  id: string;
  nom: string;
  semestre: string;
  dateExamen: string | null;
  statut: "active" | "archivee";
  methodologieTitres: string | null;
};

type Chapter = {
  id: string;
  titre: string;
  version: number;
  statut: "actif" | "archive";
};

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
          <ul className="flex flex-col gap-1">
            {chapters.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm">
                <span>{c.titre}</span>
                <Badge variant="secondary">v{c.version}</Badge>
                {c.statut === "archive" && <Badge variant="outline">archivé</Badge>}
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
