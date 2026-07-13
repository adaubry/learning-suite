"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PencilIcon, SquarePenIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { StrongConfirmDialog } from "@/components/confirm-dialog";
import {
  createRubricQueue,
  isRubricSectionQueued,
  type RubricQueueItem,
} from "@/components/rubric-generation-queue";
import {
  createSubjectAction,
  updateSubjectAction,
  archiveSubjectAction,
  unarchiveSubjectAction,
  deleteSubjectAction,
  generateRubricAction,
  createManualRubricAction,
} from "../actions";

// Une seule file pour toute la page /curriculum (les sections en jeu peuvent
// appartenir à des chapitres/matières différents) — instanciée une fois au
// chargement du module, partagée par SectionRow et RubricQueuePanel. Les deux
// actions Server ne redirigent plus (app/(app)/actions.ts) : c'est cette file
// qui décide quand passer à la suivante.
function sectionFormData(sectionId: string) {
  const formData = new FormData();
  formData.set("sectionId", sectionId);
  return formData;
}
const rubricQueue = createRubricQueue(
  (sectionId) => generateRubricAction(undefined, sectionFormData(sectionId)),
  (sectionId) => createManualRubricAction(undefined, sectionFormData(sectionId)),
);

function useRubricQueueItems() {
  return useSyncExternalStore(rubricQueue.subscribe, rubricQueue.getSnapshot, () => []);
}

const rubricQueueStatusLabel: Record<RubricQueueItem["status"], string> = {
  en_attente: "en attente",
  en_cours: "génération…",
  termine: "terminé",
  erreur: "échec",
};

const rubricQueueKindLabel: Record<RubricQueueItem["kind"], string> = {
  generer: "Générer la rubrique",
  manuel: "Rédiger manuellement",
};

export function RubricQueuePanel() {
  const router = useRouter();
  const items = useRubricQueueItems();
  const settledCount = useRef(0);

  useEffect(() => {
    const count = items.filter((i) => i.status === "termine" || i.status === "erreur").length;
    if (count !== settledCount.current) {
      settledCount.current = count;
      router.refresh();
    }
  }, [items, router]);

  if (items.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1 rounded border p-2 text-sm">
      {items.map((item) => (
        <li key={item.id} className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="flex-1">
              {rubricQueueKindLabel[item.kind]} — {item.sectionTitre}
            </span>
            <Badge variant={item.status === "erreur" ? "destructive" : "outline"}>
              {rubricQueueStatusLabel[item.status]}
            </Badge>
            {item.status === "en_attente" && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => rubricQueue.cancel(item.id)}
                aria-label="Annuler"
              >
                <XIcon />
              </Button>
            )}
            {(item.status === "termine" || item.status === "erreur") && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => rubricQueue.dismiss(item.id)}
                aria-label="Masquer"
              >
                <XIcon />
              </Button>
            )}
          </div>
          {item.status === "erreur" && item.error && (
            <p className="text-xs text-destructive">{item.error}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

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
  const items = useRubricQueueItems();
  // Les deux boutons créent une rubrique pour la MÊME section — un double-clic
  // générer+rédiger manuellement viole la contrainte d'unicité en base (une
  // rubrique non-obsolète par section, même classe de bug que
  // correction-view.tsx). La file (rubric-generation-queue.ts) l'empêche déjà
  // par construction (dédoublonnage par sectionId) ; désactiver les boutons ici
  // évite en plus de laisser partir un clic pour rien.
  const submitting = isRubricSectionQueued(items, section.id);

  return (
    <li className="flex flex-col gap-1 border-l pl-2 py-1 text-sm">
      <div className="flex items-center gap-2">
        <span>{section.titre}</span>
        <Badge variant="secondary">imp. {section.importance}</Badge>
        <Badge variant="outline">{sectionStatutLabel[section.statut]}</Badge>
      </div>
      {section.statut === "active" && (
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={submitting}
            onClick={() => rubricQueue.enqueue(section.id, section.titre, "generer")}
          >
            Générer la rubrique
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={submitting}
            onClick={() => rubricQueue.enqueue(section.id, section.titre, "manuel")}
          >
            Rédiger manuellement
          </Button>
        </div>
      )}
      {section.statut === "rubrique_a_valider" && (
        <Button size="sm" nativeButton={false} render={<Link href={`/section/${section.id}/rubrique`} />}>
          Valider la rubrique
        </Button>
      )}
    </li>
  );
}

export function AddSubjectForm() {
  const [state, action, pending] = useActionState(createSubjectAction, undefined);

  return (
    <form action={action} className="flex flex-col gap-3 rounded border p-4">
      <h2 className="text-sm font-semibold">Ajouter une matière</h2>
      <div className="flex flex-col gap-3 sm:flex-row">
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

function EditSubjectDialog({ subject }: { subject: Subject }) {
  const [state, action, pending] = useActionState(updateSubjectAction, undefined);
  const [open, setOpen] = useState(false);
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state?.success) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <PencilIcon />
            Modifier
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier « {subject.nom} »</DialogTitle>
        </DialogHeader>
        {open && (
          <form action={action} className="flex flex-col gap-3">
            <input type="hidden" name="subjectId" value={subject.id} />
            <div className="flex flex-col gap-3 sm:flex-row">
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
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SubjectCard({ subject, chapters }: { subject: Subject; chapters: Chapter[] }) {
  return (
    <div className="flex flex-col gap-4 rounded border p-4">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold">{subject.nom}</h3>
        <Badge variant="secondary">{subject.semestre}</Badge>
        {subject.statut === "archivee" && <Badge variant="outline">archivée</Badge>}
        <EditSubjectDialog subject={subject} />
      </div>

      <div className="flex flex-col gap-2 border-t pt-3">
        {chapters.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun chapitre pour l&apos;instant.</p>
        ) : (
          <Accordion multiple className="flex flex-col gap-2">
            {chapters.map((c) => {
              const aTraiter = c.sections.filter(
                (s) => s.statut === "active" || s.statut === "rubrique_a_valider",
              ).length;
              return (
                <AccordionItem
                  key={c.id}
                  value={c.id}
                  className="rounded-lg border px-3"
                >
                  <div className="flex items-center gap-1">
                    <AccordionTrigger className="flex-1 py-2">
                      <span className="flex flex-1 flex-wrap items-center gap-2 text-sm font-medium">
                        {c.titre}
                        <Badge variant="secondary">v{c.version}</Badge>
                        {c.statut === "archive" && <Badge variant="outline">archivé</Badge>}
                        {aTraiter > 0 && <Badge>{aTraiter} à traiter</Badge>}
                        {c.sections.length === 0 && (
                          <span className="text-xs font-normal text-muted-foreground">
                            aucune section
                          </span>
                        )}
                      </span>
                    </AccordionTrigger>
                    <Button
                      variant="ghost"
                      size="sm"
                      nativeButton={false}
                      render={<Link href={`/curriculum/chapitre/${c.id}`} />}
                    >
                      <SquarePenIcon />
                      Ouvrir
                    </Button>
                  </div>
                  <AccordionContent>
                    {c.sections.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Aucune section.</p>
                    ) : (
                      <ul className="flex flex-col">
                        {c.sections.map((s) => (
                          <SectionRow key={s.id} section={s} />
                        ))}
                      </ul>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
        <div className="flex items-center gap-2">
          <form action={subject.statut === "active" ? archiveSubjectAction : unarchiveSubjectAction}>
            <input type="hidden" name="subjectId" value={subject.id} />
            <Button type="submit" variant="outline" size="sm">
              {subject.statut === "active" ? "Archiver" : "Désarchiver"}
            </Button>
          </form>
          {/* USER_FLOW É6.4 : archivage toujours proposé avant la suppression. */}
          <StrongConfirmDialog
            trigger={
              <Button size="sm" variant="destructive">
                Supprimer
              </Button>
            }
            title={`Supprimer définitivement « ${subject.nom} » ?`}
            description="Détruit tous les chapitres, sections, rubriques et l'historique d'étude de cette matière. Irréversible — préfère l'archivage pour une matière terminée."
            confirmWord={subject.nom}
            confirmLabel="Supprimer définitivement"
            action={deleteSubjectAction.bind(null, subject.id)}
          />
        </div>
      </div>
    </div>
  );
}
