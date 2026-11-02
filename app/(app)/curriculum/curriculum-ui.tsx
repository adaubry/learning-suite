"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { PencilIcon } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { DateInput } from "@astryxdesign/core/DateInput";
import type { ISODateString } from "@astryxdesign/core/Calendar";
import { Badge } from "@astryxdesign/core/Badge";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Card, HStack, Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { CollapsibleGroup, useCollapsible } from "@astryxdesign/core/Collapsible";
import { Icon } from "@astryxdesign/core/Icon";
import { List, ListItem } from "@astryxdesign/core/List";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { StrongConfirmDialog } from "@/components/confirm-dialog";
import {
  createSubjectAction,
  updateSubjectAction,
  archiveSubjectAction,
  unarchiveSubjectAction,
  deleteSubjectAction,
  archiveSetAction,
  unarchiveSetAction,
  deleteSetAction,
} from "../actions";

// Curriculum v2 (USER_FLOW.md v2) : matières → sets de fiches → fiches.

type Subject = {
  id: string;
  nom: string;
  semestre: string;
  dateExamen: string | null;
  statut: "active" | "archivee";
};

type FicheRow = {
  id: string;
  numero: number;
  titre: string;
  statut: "nouvelle" | "en_revision" | "archivee";
  due: string | null;
};

type FicheSet = {
  id: string;
  titre: string;
  statut: "actif" | "archive";
  importedAt: Date;
  fiches: FicheRow[];
};

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
}

function FicheItem({ fiche }: { fiche: FicheRow }) {
  return (
    <ListItem
      label={`${fiche.numero}. ${fiche.titre}`}
      href={`/fiche/${fiche.id}`}
      description={
        <HStack gap={2} align="center" wrap="wrap" paddingBlock={1}>
          {fiche.statut === "nouvelle" && <StatusDot variant="neutral" label="nouvelle" />}
          {fiche.statut === "en_revision" && (
            <StatusDot variant="accent" label={fiche.due ? `révision le ${formatDate(fiche.due)}` : "en révision"} />
          )}
          {fiche.statut === "archivee" && <StatusDot variant="neutral" label="retirée du set" />}
        </HStack>
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

function SetItem({ set }: { set: FicheSet }) {
  const { isOpen, toggle } = useCollapsible({ isCollapsible: { defaultIsOpen: false }, value: set.id });
  const visibles = set.fiches.filter((f) => f.statut !== "archivee");
  const nouvelles = visibles.filter((f) => f.statut === "nouvelle").length;

  return (
    <div className="rounded-none border border-border bg-surface">
      <HStack gap={2} align="center" justify="between" wrap="wrap" paddingInline={3} paddingBlock={1}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-sm font-medium"
        >
          <Icon icon="chevronDown" size="sm" className={isOpen ? "" : "-rotate-90"} />
          <span>{set.titre}</span>
          <Badge variant="neutral" label={`${visibles.length} fiches`} />
          {nouvelles > 0 && <Badge variant="neutral" label={`${nouvelles} nouvelles`} />}
          {set.statut === "archive" && <Badge variant="neutral" label="archivé" />}
        </button>
        <HStack gap={1} wrap="wrap">
          <Button variant="ghost" size="sm" label="Ré-importer" as={Link} href={`/importer?set=${set.id}`} />
          <form action={set.statut === "actif" ? archiveSetAction.bind(null, set.id) : unarchiveSetAction.bind(null, set.id)}>
            <Button type="submit" variant="ghost" size="sm" label={set.statut === "actif" ? "Archiver" : "Désarchiver"} />
          </form>
          <StrongConfirmDialog
            trigger={<Button size="sm" variant="ghost" label="Supprimer" />}
            title={`Supprimer définitivement « ${set.titre} » ?`}
            description="Détruit les fiches de ce set et tout leur historique de révision. Irréversible — préfère l'archivage."
            confirmWord={set.titre}
            confirmLabel="Supprimer définitivement"
            action={deleteSetAction.bind(null, set.id)}
          />
        </HStack>
      </HStack>

      {isOpen && (
        <div className="px-3 pb-2">
          <List hasDividers density="compact">
            {set.fiches.map((f) => (
              <FicheItem key={f.id} fiche={f} />
            ))}
          </List>
        </div>
      )}
    </div>
  );
}

function matchesQuery(text: string, query: string) {
  return text.toLowerCase().includes(query.toLowerCase());
}

// Filtre client léger matière / set / fiche : la page a déjà tout chargé.
export function CurriculumFilter({ subjectsWithSets }: { subjectsWithSets: { subject: Subject; sets: FicheSet[] }[] }) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();

  const filtered = trimmed
    ? subjectsWithSets.flatMap(({ subject, sets }) => {
        if (matchesQuery(subject.nom, trimmed)) return [{ subject, sets }];
        const filteredSets = sets.flatMap((set) => {
          if (matchesQuery(set.titre, trimmed)) return [set];
          const fiches = set.fiches.filter((f) => matchesQuery(f.titre, trimmed));
          return fiches.length > 0 ? [{ ...set, fiches }] : [];
        });
        return filteredSets.length > 0 ? [{ subject, sets: filteredSets }] : [];
      })
    : subjectsWithSets;

  return (
    <div className="flex flex-col gap-4">
      {subjectsWithSets.length > 0 && (
        <TextInput
          label="Rechercher une matière, un set ou une fiche"
          isLabelHidden
          placeholder="Rechercher…"
          value={query}
          onChange={setQuery}
        />
      )}
      {trimmed && filtered.length === 0 ? (
        <Text type="supporting">Aucun résultat pour « {trimmed} ».</Text>
      ) : (
        filtered.map(({ subject, sets }) => <SubjectCard key={subject.id} subject={subject} sets={sets} />)
      )}
    </div>
  );
}

function SubjectCard({ subject, sets }: { subject: Subject; sets: FicheSet[] }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{subject.nom}</h3>
        <Badge variant="neutral" label={subject.semestre} />
        {subject.dateExamen && <Badge variant="neutral" label={`examen le ${formatDate(subject.dateExamen)}`} />}
        {subject.statut === "archivee" && <Badge variant="neutral" label="archivée" />}
        <EditSubjectDialog subject={subject} />
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t pt-3">
        {sets.length === 0 ? (
          <p className="text-sm text-secondary">Aucun set de fiches pour l&apos;instant.</p>
        ) : (
          <CollapsibleGroup type="multiple" defaultValue={[]}>
            <div className="flex flex-col gap-2">
              {sets.map((s) => (
                <SetItem key={s.id} set={s} />
              ))}
            </div>
          </CollapsibleGroup>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <form
            action={
              subject.statut === "active"
                ? archiveSubjectAction.bind(null, subject.id)
                : unarchiveSubjectAction.bind(null, subject.id)
            }
          >
            <Button type="submit" variant="secondary" size="sm" label={subject.statut === "active" ? "Archiver" : "Désarchiver"} />
          </form>
          <StrongConfirmDialog
            trigger={<Button size="sm" variant="destructive" label="Supprimer" />}
            title={`Supprimer définitivement « ${subject.nom} » ?`}
            description="Détruit tous les sets de fiches et l'historique de révision de cette matière. Irréversible — préfère l'archivage pour une matière terminée."
            confirmWord={subject.nom}
            confirmLabel="Supprimer définitivement"
            action={deleteSubjectAction.bind(null, subject.id)}
          />
        </div>
      </div>
    </Card>
  );
}
