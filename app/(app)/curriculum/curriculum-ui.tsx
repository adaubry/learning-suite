"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PencilIcon, SquarePenIcon, XIcon } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { DateInput } from "@astryxdesign/core/DateInput";
import type { ISODateString } from "@astryxdesign/core/Calendar";
import { Badge } from "@astryxdesign/core/Badge";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Card, Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { CollapsibleGroup, useCollapsible } from "@astryxdesign/core/Collapsible";
import { Icon } from "@astryxdesign/core/Icon";
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

const EMPTY_RUBRIC_QUEUE: RubricQueueItem[] = [];
function useRubricQueueItems() {
  return useSyncExternalStore(rubricQueue.subscribe, rubricQueue.getSnapshot, () => EMPTY_RUBRIC_QUEUE);
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
            <Badge variant={item.status === "erreur" ? "error" : "neutral"} label={rubricQueueStatusLabel[item.status]} />
            {item.status === "en_attente" && (
              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                icon={<XIcon size={14} />}
                label="Annuler"
                onClick={() => rubricQueue.cancel(item.id)}
              />
            )}
            {(item.status === "termine" || item.status === "erreur") && (
              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                icon={<XIcon size={14} />}
                label="Masquer"
                onClick={() => rubricQueue.dismiss(item.id)}
              />
            )}
          </div>
          {item.status === "erreur" && item.error && (
            <p className="text-xs text-error">{item.error}</p>
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
        <Badge variant="neutral" label={`imp. ${section.importance}`} />
        <Badge variant="neutral" label={sectionStatutLabel[section.statut]} />
      </div>
      {section.statut === "active" && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            isDisabled={submitting}
            label="Générer la rubrique"
            onClick={() => rubricQueue.enqueue(section.id, section.titre, "generer")}
          />
          <Button
            size="sm"
            variant="ghost"
            isDisabled={submitting}
            label="Rédiger manuellement"
            onClick={() => rubricQueue.enqueue(section.id, section.titre, "manuel")}
          />
        </div>
      )}
      {section.statut === "rubrique_a_valider" && (
        <Button size="sm" as={Link} href={`/section/${section.id}/rubrique`} label="Valider la rubrique" />
      )}
    </li>
  );
}

export function AddSubjectForm() {
  const [state, action, pending] = useActionState(createSubjectAction, undefined);
  const [nom, setNom] = useState("");
  const [semestre, setSemestre] = useState("");
  const [dateExamen, setDateExamen] = useState<ISODateString | undefined>(undefined);

  return (
    <form action={action} className="flex flex-col gap-3 rounded border p-4">
      <h2 className="text-sm font-semibold">Ajouter une matière</h2>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <TextInput label="Nom" value={nom} onChange={setNom} htmlName="nom" isRequired placeholder="Droit civil" />
        </div>
        <div className="flex-1">
          <TextInput
            label="Semestre"
            value={semestre}
            onChange={setSemestre}
            htmlName="semestre"
            isRequired
            placeholder="S1"
          />
        </div>
        <div className="flex-1">
          {/* DateInput n'a pas de htmlName natif — la valeur part via le champ caché ci-dessous. */}
          <DateInput label="Date d'examen" value={dateExamen} onChange={setDateExamen} isOptional />
        </div>
      </div>
      <input type="hidden" name="dateExamen" value={dateExamen ?? ""} />
      <Button type="submit" isDisabled={pending} label={pending ? "Ajout…" : "Ajouter"} className="self-start" />
      {state?.error && <p className="text-sm text-error">{state.error}</p>}
    </form>
  );
}

function EditSubjectFields({
  subject,
  action,
  pending,
  error,
  setOpen,
}: {
  subject: Subject;
  action: (formData: FormData) => void;
  pending: boolean;
  error?: string;
  setOpen: (open: boolean) => void;
}) {
  const [nom, setNom] = useState(subject.nom);
  const [semestre, setSemestre] = useState(subject.semestre);
  const [dateExamen, setDateExamen] = useState<ISODateString | undefined>(
    (subject.dateExamen as ISODateString | null) ?? undefined,
  );
  const [methodologieTitres, setMethodologieTitres] = useState(subject.methodologieTitres ?? "");

  return (
    <form action={action}>
      <input type="hidden" name="subjectId" value={subject.id} />
      <input type="hidden" name="dateExamen" value={dateExamen ?? ""} />
      <Layout
        header={<DialogHeader title={`Modifier « ${subject.nom} »`} onOpenChange={setOpen} />}
        content={
          <LayoutContent>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1">
                  <TextInput label="Nom" value={nom} onChange={setNom} htmlName="nom" isRequired />
                </div>
                <div className="flex-1">
                  <TextInput label="Semestre" value={semestre} onChange={setSemestre} htmlName="semestre" isRequired />
                </div>
                <div className="flex-1">
                  <DateInput label="Date d'examen" value={dateExamen} onChange={setDateExamen} isOptional hasClear />
                </div>
              </div>
              <TextArea
                label="Surcharge méthodologie des titres"
                value={methodologieTitres}
                onChange={setMethodologieTitres}
                htmlName="methodologieTitres"
                rows={3}
                isOptional
                description="Laisser vide pour utiliser la méthodologie globale"
              />
              {error && <p className="text-sm text-error">{error}</p>}
            </div>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <Button type="submit" size="sm" isDisabled={pending} label={pending ? "Enregistrement…" : "Enregistrer"} />
          </LayoutFooter>
        }
      />
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
    <>
      <Button
        variant="secondary"
        size="sm"
        icon={<PencilIcon size={16} />}
        label="Modifier"
        onClick={() => setOpen(true)}
      />
      <Dialog isOpen={open} onOpenChange={setOpen} purpose="form" width={640}>
        {open && (
          <EditSubjectFields subject={subject} action={action} pending={pending} error={state?.error} setOpen={setOpen} />
        )}
      </Dialog>
    </>
  );
}

function ChapterItem({ chapter }: { chapter: Chapter }) {
  const { isOpen, toggle } = useCollapsible({ isCollapsible: { defaultIsOpen: false }, value: chapter.id });
  const aTraiter = chapter.sections.filter(
    (s) => s.statut === "active" || s.statut === "rubrique_a_valider",
  ).length;

  return (
    <Card padding={0}>
      <div className="flex items-center gap-1 px-3 py-1">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          className="flex flex-1 flex-wrap items-center gap-2 py-1 text-left text-sm font-medium"
        >
          <Icon icon="chevronDown" size="sm" className={isOpen ? "" : "-rotate-90"} />
          {chapter.titre}
          <Badge variant="neutral" label={`v${chapter.version}`} />
          {chapter.statut === "archive" && <Badge variant="neutral" label="archivé" />}
          {aTraiter > 0 && <Badge variant="info" label={`${aTraiter} à traiter`} />}
          {chapter.sections.length === 0 && (
            <span className="text-xs font-normal text-secondary">aucune section</span>
          )}
        </button>
        <Button
          variant="ghost"
          size="sm"
          icon={<SquarePenIcon size={16} />}
          label="Ouvrir"
          as={Link}
          href={`/curriculum/chapitre/${chapter.id}`}
        />
      </div>
      {isOpen && (
        <div className="px-3 pb-2">
          {chapter.sections.length === 0 ? (
            <p className="text-sm text-secondary">Aucune section.</p>
          ) : (
            <ul className="flex flex-col">
              {chapter.sections.map((s) => (
                <SectionRow key={s.id} section={s} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

export function SubjectCard({ subject, chapters }: { subject: Subject; chapters: Chapter[] }) {
  return (
    <Card>
      <div className="flex items-center gap-2">
        <h3 className="font-semibold">{subject.nom}</h3>
        <Badge variant="neutral" label={subject.semestre} />
        {subject.statut === "archivee" && <Badge variant="neutral" label="archivée" />}
        <EditSubjectDialog subject={subject} />
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t pt-3">
        {chapters.length === 0 ? (
          <p className="text-sm text-secondary">Aucun chapitre pour l&apos;instant.</p>
        ) : (
          <CollapsibleGroup type="multiple" defaultValue={[]}>
            <div className="flex flex-col gap-2">
              {chapters.map((c) => (
                <ChapterItem key={c.id} chapter={c} />
              ))}
            </div>
          </CollapsibleGroup>
        )}
        <div className="flex items-center gap-2">
          <form action={subject.statut === "active" ? archiveSubjectAction : unarchiveSubjectAction}>
            <input type="hidden" name="subjectId" value={subject.id} />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              label={subject.statut === "active" ? "Archiver" : "Désarchiver"}
            />
          </form>
          {/* USER_FLOW É6.4 : archivage toujours proposé avant la suppression. */}
          <StrongConfirmDialog
            trigger={<Button size="sm" variant="destructive" label="Supprimer" />}
            title={`Supprimer définitivement « ${subject.nom} » ?`}
            description="Détruit tous les chapitres, sections, rubriques et l'historique d'étude de cette matière. Irréversible — préfère l'archivage pour une matière terminée."
            confirmWord={subject.nom}
            confirmLabel="Supprimer définitivement"
            action={deleteSubjectAction.bind(null, subject.id)}
          />
        </div>
      </div>
    </Card>
  );
}
