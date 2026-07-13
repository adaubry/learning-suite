"use client";

import { cloneElement, useState, type MouseEvent, type ReactElement } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter, HStack } from "@astryxdesign/core/Layout";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";

// U8 ConfirmDialog (FUNCTIONS §6.1, TECH_MAPPING §U8) — variante LÉGÈRE (confirmation simple,
// un clic).
export function ConfirmDialog({
  trigger,
  title,
  description,
  action,
  confirmLabel = "Confirmer",
  onConfirm,
}: {
  trigger: ReactElement<{ onClick?: (e: MouseEvent) => void }>;
  title: string;
  description: string;
  action: () => Promise<void>;
  confirmLabel?: string;
  /** Appelé à la confirmation, avant `action` — permet à l'appelant de verrouiller
   *  d'autres actions concurrentes sur la même entité (ex. error-notebook.tsx). */
  onConfirm?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {cloneElement(trigger, {
        onClick: (e: MouseEvent) => {
          trigger.props.onClick?.(e);
          setOpen(true);
        },
      })}
      <Dialog isOpen={open} onOpenChange={setOpen} width={400} purpose="required">
        <Layout
          header={<DialogHeader title={title} onOpenChange={() => setOpen(false)} />}
          content={
            <LayoutContent>
              <Text type="body">{description}</Text>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label="Annuler" variant="secondary" onClick={() => setOpen(false)} />
                <form action={action} onSubmit={onConfirm}>
                  <Button type="submit" label={confirmLabel} variant="destructive" />
                </form>
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}

// U8 ConfirmDialog — variante FORTE (USER_FLOW É6.4 : suppression matière/chapitre, « nom à
// retaper », détruit l'historique). L'archivage reste toujours proposé en premier côté appelant
// (bouton séparé) — ce composant ne fait que la confirmation destructive elle-même.
export function StrongConfirmDialog({
  trigger,
  title,
  description,
  confirmWord,
  action,
  confirmLabel = "Supprimer définitivement",
}: {
  trigger: ReactElement<{ onClick?: (e: MouseEvent) => void }>;
  title: string;
  description: string;
  /** Le mot (nom de la matière/du chapitre) que l'utilisateur doit retaper à l'identique. */
  confirmWord: string;
  action: () => Promise<void>;
  confirmLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const matches = typed === confirmWord;

  const close = () => {
    setOpen(false);
    setTyped("");
  };

  return (
    <>
      {cloneElement(trigger, {
        onClick: (e: MouseEvent) => {
          trigger.props.onClick?.(e);
          setOpen(true);
        },
      })}
      <Dialog isOpen={open} onOpenChange={(next) => (next ? setOpen(true) : close())} width={400} purpose="required">
        <Layout
          header={<DialogHeader title={title} onOpenChange={close} />}
          content={
            <LayoutContent>
              <Text type="body">{description}</Text>
              <TextInput
                label={`Retape « ${confirmWord} » pour confirmer`}
                value={typed}
                onChange={setTyped}
              />
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label="Annuler" variant="secondary" onClick={close} />
                <form action={action}>
                  <Button type="submit" label={confirmLabel} variant="destructive" isDisabled={!matches} />
                </form>
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}
