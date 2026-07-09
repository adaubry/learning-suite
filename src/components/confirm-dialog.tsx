"use client";

import type { ReactElement } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// U8 ConfirmDialog (FUNCTIONS §6.1, TECH_MAPPING §U8) — variante LÉGÈRE
// uniquement (confirmation simple, un clic). La variante FORTE (nom à
// retaper, archivage proposé d'abord) attend le bloc qui suppose une
// suppression destructive avec dépendants (matière/chapitre, É6.4) —
// prématurée ici (ErrorEntry n'a aucun dépendant).
export function ConfirmDialog({
  trigger,
  title,
  description,
  action,
  confirmLabel = "Confirmer",
  onConfirm,
}: {
  trigger: ReactElement;
  title: string;
  description: string;
  action: () => Promise<void>;
  confirmLabel?: string;
  /** Appelé à la confirmation, avant `action` — permet à l'appelant de verrouiller
   *  d'autres actions concurrentes sur la même entité (ex. error-notebook.tsx). */
  onConfirm?: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <form action={action} onSubmit={onConfirm}>
            <AlertDialogAction type="submit" variant="destructive">
              {confirmLabel}
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
