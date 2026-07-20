"use client";

import { useState } from "react";
import { Repeat } from "lucide-react";
import { List, ListItem } from "@astryxdesign/core/List";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter, HStack } from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { DateInput } from "@astryxdesign/core/DateInput";
import { queueToast } from "./toast-host";
import {
  ackDeadlineAction,
  unackDeadlineAction,
  removeDeadlineAction,
  createDeadlineAction,
  updateDeadlineAction,
} from "../../app/(app)/regularite/actions";
import type { deadline as deadlineTable } from "@/db/schema";

// U27 DeadlineChecklist (IMPLEMENT_SCHEDULE.md §7) — toutes les deadlines
// `ackAt IS NULL`, triées par dueDate. Aucun pourcentage de complétion nulle
// part (§8 critère 4) : ni ici, ni ailleurs sur l'écran.

type DeadlineRow = typeof deadlineTable.$inferSelect;
type SubjectOption = { id: string; nom: string };
type IsoDate = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

function asIsoDate(s: string): IsoDate | undefined {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? (s as IsoDate) : undefined;
}

const TYPE_LABELS: Record<DeadlineRow["type"], string> = {
  examen: "Examen",
  controle_continu: "Contrôle continu",
  autre: "Autre",
};

function daysUntil(today: string, due: string): number {
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

function DistancePill({ distance }: { distance: number }) {
  if (distance < 0) return <Badge variant="error" label={`J+${Math.abs(distance)}`} />;
  if (distance < 7) return <Badge variant="error" label={`J-${distance}`} />;
  if (distance < 14) return <Badge variant="warning" label={`J-${distance}`} />;
  return <Badge variant="neutral" label={`J-${distance}`} />;
}

function DeadlineFormFields({
  value,
  onChange,
  showOccurrences,
}: {
  value: {
    subjectId: string;
    type: DeadlineRow["type"];
    libelle: string;
    dueDate: string;
    coefficient: string;
    dureeMin: string;
    occurrences: string;
  };
  onChange: (patch: Partial<typeof value>) => void;
  showOccurrences: boolean;
  subjects: SubjectOption[];
}) {
  return (
    <>
      <Selector
        label="Type"
        value={value.type}
        onChange={(v) => onChange({ type: v as DeadlineRow["type"] })}
        options={(["examen", "controle_continu", "autre"] as const).map((t) => ({
          value: t,
          label: TYPE_LABELS[t],
        }))}
      />
      <TextInput label="Libellé" value={value.libelle} onChange={(v) => onChange({ libelle: v })} />
      <DateInput label="Date" value={asIsoDate(value.dueDate)} onChange={(v) => onChange({ dueDate: v ?? "" })} />
      <NumberInput
        label="Coefficient"
        isOptional
        value={value.coefficient ? Number(value.coefficient) : null}
        onChange={(v) => onChange({ coefficient: v == null ? "" : String(v) })}
      />
      <NumberInput
        label="Durée (min)"
        isOptional
        value={value.dureeMin ? Number(value.dureeMin) : null}
        onChange={(v) => onChange({ dureeMin: v == null ? "" : String(v) })}
      />
      {showOccurrences && (
        <NumberInput
          label="Occurrences hebdomadaires"
          description="Déplie plusieurs lignes espacées de 7 jours (contrôles continus récurrents)."
          value={value.occurrences ? Number(value.occurrences) : 1}
          min={1}
          max={52}
          onChange={(v) => onChange({ occurrences: String(v ?? 1) })}
        />
      )}
    </>
  );
}

const EMPTY_FORM = {
  subjectId: "",
  type: "examen" as DeadlineRow["type"],
  libelle: "",
  dueDate: "",
  coefficient: "",
  dureeMin: "",
  occurrences: "1",
};

function AddDeadlineDialog({ subjects }: { subjects: SubjectOption[] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setForm(EMPTY_FORM);
    setError(null);
  };

  return (
    <>
      <Button label="Ajouter" variant="secondary" onClick={() => setOpen(true)} />
      <Dialog isOpen={open} onOpenChange={(next) => (next ? setOpen(true) : close())} width={420}>
        <Layout
          header={<DialogHeader title="Nouvelle échéance" onOpenChange={close} />}
          content={
            <LayoutContent>
              <DeadlineFormFields
                value={form}
                onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
                showOccurrences
                subjects={subjects}
              />
              {error && <Badge variant="error" label={error} />}
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label="Annuler" variant="secondary" onClick={close} />
                <Button
                  label="Créer"
                  variant="primary"
                  clickAction={async () => {
                    if (!form.libelle.trim() || !form.dueDate) {
                      setError("Libellé et date requis.");
                      return;
                    }
                    await createDeadlineAction({
                      subjectId: form.subjectId || undefined,
                      type: form.type,
                      libelle: form.libelle,
                      dueDate: form.dueDate,
                      coefficient: form.coefficient ? Number(form.coefficient) : undefined,
                      dureeMin: form.dureeMin ? Number(form.dureeMin) : undefined,
                      occurrences: Number(form.occurrences) || 1,
                    });
                    close();
                  }}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}

function EditDeadlineDialog({
  row,
  subjects,
  open,
  onOpenChange,
}: {
  row: DeadlineRow;
  subjects: SubjectOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState({
    subjectId: row.subjectId ?? "",
    type: row.type,
    libelle: row.libelle,
    dueDate: row.dueDate,
    coefficient: row.coefficient != null ? String(row.coefficient) : "",
    dureeMin: row.dureeMin != null ? String(row.dureeMin) : "",
    occurrences: "1",
  });

  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange} width={420}>
      <Layout
        header={<DialogHeader title="Modifier l'échéance" onOpenChange={() => onOpenChange(false)} />}
        content={
          <LayoutContent>
            <DeadlineFormFields
              value={form}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
              showOccurrences={false}
              subjects={subjects}
            />
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label="Annuler" variant="secondary" onClick={() => onOpenChange(false)} />
              <Button
                label="Enregistrer"
                variant="primary"
                clickAction={async () => {
                  await updateDeadlineAction({
                    id: row.id,
                    subjectId: form.subjectId || undefined,
                    type: form.type,
                    libelle: form.libelle,
                    dueDate: form.dueDate,
                    coefficient: form.coefficient ? Number(form.coefficient) : undefined,
                    dureeMin: form.dureeMin ? Number(form.dureeMin) : undefined,
                  });
                  onOpenChange(false);
                }}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}

function DeadlineRow({ row, subjects, today }: { row: DeadlineRow; subjects: SubjectOption[]; today: string }) {
  const [editing, setEditing] = useState(false);
  const matiere = subjects.find((s) => s.id === row.subjectId)?.nom;

  const ack = async () => {
    await ackDeadlineAction(row.id);
    queueToast({
      body: "Échéance cochée",
      kind: "action",
      endContent: (
        <Button
          label="Annuler"
          variant="ghost"
          size="sm"
          clickAction={async () => {
            await unackDeadlineAction(row.id);
          }}
        />
      ),
    });
  };

  return (
    <>
      <ListItem
        startContent={<CheckboxInput label="Cocher" isLabelHidden value={false} changeAction={ack} />}
        label={row.libelle}
        description={matiere}
        endContent={
          <HStack gap={2}>
            {row.recurrenceGroupId && <Repeat size={14} aria-label="Récurrent" />}
            {row.coefficient != null && <Badge variant="neutral" label={`coef ${row.coefficient}`} />}
            <DistancePill distance={daysUntil(today, row.dueDate)} />
            <DropdownMenu
              button={{ label: "Actions", isIconOnly: true, variant: "ghost", icon: "⋮" }}
              hasChevron={false}
              items={[
                { label: "Modifier", onClick: () => setEditing(true) },
                { type: "divider" },
                {
                  label: row.recurrenceGroupId ? "Supprimer cette occurrence" : "Supprimer",
                  onClick: () => void removeDeadlineAction(row.id, "this"),
                },
                ...(row.recurrenceGroupId
                  ? [
                      {
                        label: "Supprimer celle-ci et les suivantes",
                        onClick: () => void removeDeadlineAction(row.id, "following"),
                      },
                    ]
                  : []),
              ]}
            />
          </HStack>
        }
      />
      <EditDeadlineDialog row={row} subjects={subjects} open={editing} onOpenChange={setEditing} />
    </>
  );
}

const MOBILE_COLLAPSE_COUNT = 5;

export function DeadlineChecklist({
  deadlines,
  subjects,
  today,
}: {
  deadlines: DeadlineRow[];
  subjects: SubjectOption[];
  today: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const collapsible = deadlines.length > MOBILE_COLLAPSE_COUNT;

  return (
    <div className="flex flex-col gap-3">
      <HStack hAlign="between">
        <span className="font-medium">Échéances</span>
        <AddDeadlineDialog subjects={subjects} />
      </HStack>
      {deadlines.length === 0 ? (
        <p className="text-secondary text-sm">Aucune échéance à venir.</p>
      ) : (
        <>
          <div
            className={
              collapsible && !showAll
                ? "max-h-[20rem] overflow-hidden md:max-h-none md:overflow-visible"
                : ""
            }
          >
            <List hasDividers>
              {deadlines.map((d) => (
                <DeadlineRow key={d.id} row={d} subjects={subjects} today={today} />
              ))}
            </List>
          </div>
          {collapsible && (
            <div className="md:hidden">
              <Button variant="ghost" label={showAll ? "Voir moins" : "Tout voir"} onClick={() => setShowAll((v) => !v)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
