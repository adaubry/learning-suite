"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { PencilIcon, SquarePenIcon, XIcon } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { DateInput } from "@astryxdesign/core/DateInput";
import type { ISODateString } from "@astryxdesign/core/Calendar";
import { Badge } from "@astryxdesign/core/Badge";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import {
  Card,
  HStack,
  Layout,
  LayoutContent,
  LayoutFooter,
  VStack,
} from "@astryxdesign/core/Layout";
import {
  CollapsibleGroup,
  useCollapsible,
} from "@astryxdesign/core/Collapsible";
import { Icon } from "@astryxdesign/core/Icon";
import { List, ListItem } from "@astryxdesign/core/List";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
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
  (sectionId) =>
    createManualRubricAction(undefined, sectionFormData(sectionId)),
);

const EMPTY_RUBRIC_QUEUE: RubricQueueItem[] = [];
function useRubricQueueItems() {
  return useSyncExternalStore(
    rubricQueue.subscribe,
    rubricQueue.getSnapshot,
    () => EMPTY_RUBRIC_QUEUE,
  );
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
    const count = items.filter(
      (i) => i.status === "termine" || i.status === "erreur",
    ).length;
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
            <Badge
              variant={item.status === "erreur" ? "error" : "neutral"}
              label={rubricQueueStatusLabel[item.status]}
            />
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

// Code couleur de la pastille (USER_FLOW É6.0 : « statut (pastille) ») — warning pour tout ce
// qui attend une action de l'utilisateur, success pour ce qui est prêt/validé, neutral pour ce
// qui est hors-jeu (exclue/archivée) ou pas encore actionnable (importée, tri pas encore construit).
const sectionStatusDotVariant: Record<
  SectionStatut,
  "success" | "warning" | "error" | "accent" | "neutral"
> = {
  importee: "neutral",
  a_trier: "warning",
  active: "warning",
  exclue: "neutral",
  rubrique_a_valider: "warning",
  prete: "success",
  validee: "success",
  en_revision: "accent",
  archivee: "neutral",
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
    <ListItem
      label={section.titre}
      description={
        <VStack gap={1} paddingBlock={1}>
          <HStack gap={2} align="center" wrap="wrap">
            <Text type="supporting">imp. {section.importance}</Text>
            <StatusDot
              variant={sectionStatusDotVariant[section.statut]}
              label={sectionStatutLabel[section.statut]}
            />
            <Text type="supporting">{sectionStatutLabel[section.statut]}</Text>
          </HStack>
          {section.statut === "active" ? (
            <HStack gap={2} wrap="wrap">
              <Button
                size="sm"
                variant="secondary"
                isDisabled={submitting}
                label="Générer la rubrique"
                onClick={() =>
                  rubricQueue.enqueue(section.id, section.titre, "generer")
                }
              />
              <Button
                size="sm"
                variant="ghost"
                isDisabled={submitting}
                label="Rédiger manuellement"
                onClick={() =>
                  rubricQueue.enqueue(section.id, section.titre, "manuel")
                }
              />
            </HStack>
          ) : section.statut === "rubrique_a_valider" ? (
            <HStack gap={2} wrap="wrap">
              <Button
                size="sm"
                as={Link}
                href={`/section/${section.id}/rubrique`}
                label="Valider la rubrique"
              />
            </HStack>
          ) : null}
        </VStack>
      }
    />
  );
}

function AddSubjectFields({ setOpen }: { setOpen: (open: boolean) => void }) {
  const [state, action, pending] = useActionState(
    createSubjectAction,
    undefined,
  );
  const [nom, setNom] = useState("");
  const [semestre, setSemestre] = useState("");
  const [dateExamen, setDateExamen] = useState<ISODateString | undefined>(
    undefined,
  );
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state?.success) setOpen(false);
  }

  return (
    <form action={action}>
      <Layout
        header={
          <DialogHeader title="Ajouter une matière" onOpenChange={setOpen} />
        }
        content={
          <LayoutContent>
            <div className="flex flex-col gap-3">
              <TextInput
                label="Nom"
                value={nom}
                onChange={setNom}
                htmlName="nom"
                isRequired
                placeholder="Droit civil"
              />
              <TextInput
                label="Semestre"
                value={semestre}
                onChange={setSemestre}
                htmlName="semestre"
                isRequired
                placeholder="S1"
              />
              {/* DateInput n'a pas de htmlName natif — la valeur part via le champ caché ci-dessous. */}
              <DateInput
                label="Date d'examen"
                value={dateExamen}
                onChange={setDateExamen}
                isOptional
              />
              <input type="hidden" name="dateExamen" value={dateExamen ?? ""} />
              {state?.error && (
                <p className="text-sm text-error">{state.error}</p>
              )}
            </div>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} hAlign="end">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                label="Annuler"
                onClick={() => setOpen(false)}
              />
              <Button
                type="submit"
                size="sm"
                isDisabled={pending}
                label={pending ? "Ajout…" : "Ajouter"}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </form>
  );
}

export function AddSubjectDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        label="Ajouter une matière"
        onClick={() => setOpen(true)}
      />
      <Dialog isOpen={open} onOpenChange={setOpen} purpose="form" width={640}>
        {open && <AddSubjectFields setOpen={setOpen} />}
      </Dialog>
    </>
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
  const [methodologieTitres, setMethodologieTitres] = useState(
    subject.methodologieTitres ?? "",
  );

  return (
    <form action={action}>
      <input type="hidden" name="subjectId" value={subject.id} />
      <input type="hidden" name="dateExamen" value={dateExamen ?? ""} />
      <Layout
        header={
          <DialogHeader
            title={`Modifier « ${subject.nom} »`}
            onOpenChange={setOpen}
          />
        }
        content={
          <LayoutContent>
            <div className="flex flex-col gap-3">
              <TextInput
                label="Nom"
                value={nom}
                onChange={setNom}
                htmlName="nom"
                isRequired
              />
              <TextInput
                label="Semestre"
                value={semestre}
                onChange={setSemestre}
                htmlName="semestre"
                isRequired
              />
              <DateInput
                label="Date d'examen"
                value={dateExamen}
                onChange={setDateExamen}
                isOptional
                hasClear
              />
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
            <HStack gap={2} hAlign="end">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                label="Annuler"
                onClick={() => setOpen(false)}
              />
              <Button
                type="submit"
                size="sm"
                isDisabled={pending}
                label={pending ? "Enregistrement…" : "Enregistrer"}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </form>
  );
}

function EditSubjectDialog({ subject }: { subject: Subject }) {
  const [state, action, pending] = useActionState(
    updateSubjectAction,
    undefined,
  );
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
          <EditSubjectFields
            subject={subject}
            action={action}
            pending={pending}
            error={state?.error}
            setOpen={setOpen}
          />
        )}
      </Dialog>
    </>
  );
}

function ChapterItem({ chapter }: { chapter: Chapter }) {
  const { isOpen, toggle } = useCollapsible({
    isCollapsible: { defaultIsOpen: false },
    value: chapter.id,
  });
  const aTraiter = chapter.sections.filter(
    (s) => s.statut === "active" || s.statut === "rubrique_a_valider",
  ).length;

  return (
    <Card padding={0}>
      <HStack
        gap={2}
        align="center"
        justify="between"
        wrap="wrap"
        paddingInline={3}
        paddingBlock={1}
      >
        <HStack
          gap={2}
          align="center"
          wrap="wrap"
          paddingInline={3}
          paddingBlock={1}
        >
          <button
            type="button"
            onClick={toggle}
            aria-expanded={isOpen}
            className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-sm font-medium"
          >
            <Icon
              icon="chevronDown"
              size="sm"
              className={isOpen ? "" : "-rotate-90"}
            />
            <span>{chapter.titre}</span>
          </button>
          <Badge variant="neutral" label={`v${chapter.version}`} />
          {chapter.statut === "archive" && (
            <Badge variant="neutral" label="archivé" />
          )}
          {aTraiter > 0 && (
            <Badge variant="warning" label={`${aTraiter} à traiter`} />
          )}
          {chapter.sections.length === 0 && (
            <Text type="supporting">Aucune section</Text>
          )}
        </HStack>
        <Button
          variant="ghost"
          size="sm"
          icon={<SquarePenIcon size={16} />}
          label="Ouvrir"
          as={Link}
          href={`/curriculum/chapitre/${chapter.id}`}
        />
      </HStack>

      {isOpen && chapter.sections.length > 0 && (
        <div className="px-3 pb-2">
          <List hasDividers density="compact">
            {chapter.sections.map((s) => (
              <SectionRow key={s.id} section={s} />
            ))}
          </List>
        </div>
      )}
    </Card>
  );
}

export function SubjectCard({
  subject,
  chapters,
}: {
  subject: Subject;
  chapters: Chapter[];
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{subject.nom}</h3>
        <Badge variant="neutral" label={subject.semestre} />
        {subject.statut === "archivee" && (
          <Badge variant="neutral" label="archivée" />
        )}
        <EditSubjectDialog subject={subject} />
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t pt-3">
        {chapters.length === 0 ? (
          <p className="text-sm text-secondary">
            Aucun chapitre pour l&apos;instant.
          </p>
        ) : (
          <CollapsibleGroup type="multiple" defaultValue={[]}>
            <div className="flex flex-col gap-2">
              {chapters.map((c) => (
                <ChapterItem key={c.id} chapter={c} />
              ))}
            </div>
          </CollapsibleGroup>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <form
            action={
              subject.statut === "active"
                ? archiveSubjectAction
                : unarchiveSubjectAction
            }
          >
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
            trigger={
              <Button size="sm" variant="destructive" label="Supprimer" />
            }
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
