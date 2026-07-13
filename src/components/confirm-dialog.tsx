"use client";

import { useState, type ReactElement } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  trigger: ReactElement;
  title: string;
  description: string;
  /** Le mot (nom de la matière/du chapitre) que l'utilisateur doit retaper à l'identique. */
  confirmWord: string;
  action: () => Promise<void>;
  confirmLabel?: string;
}) {
  const [typed, setTyped] = useState("");
  const matches = typed === confirmWord;

  return (
    <AlertDialog onOpenChange={(open) => !open && setTyped("")}>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-1">
          <Label htmlFor="confirm-word">
            Retape « {confirmWord} » pour confirmer
          </Label>
          <Input id="confirm-word" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <form action={action}>
            <AlertDialogAction type="submit" variant="destructive" disabled={!matches}>
              {confirmLabel}
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
