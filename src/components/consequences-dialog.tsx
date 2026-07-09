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
import { DiffViewer } from "@/components/diff-viewer";
import type { UpdateSimulation } from "@/services/chapter";

// U7 ConsequencesDialog (FUNCTIONS §6.1) — LE dialogue de pré-commit, partagé É6.2/É6.3
// (Bloc 8.3/8.4) : un seul rendu du bilan de S1.simulateUpdate. Le composant ne recalcule
// rien — `action` (Server Action) rappelle S1.commitUpdate côté serveur, jamais un payload
// dérivé de `simulation` (même doctrine que S1 lui-même : recalcul serveur, pas de confiance
// dans un aller-retour client).
export function ConsequencesDialog({
  trigger,
  simulation,
  action,
}: {
  trigger: ReactElement;
  simulation: UpdateSimulation;
  action: () => Promise<void>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Version {simulation.versionActuelle} → {simulation.versionSuivante}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {simulation.intactes} intacte(s) · {simulation.rubriquesInvalidees} rubrique(s) invalidée(s) ·{" "}
            {simulation.nouvelles} nouvelle(s) à trier · {simulation.archivees} archivée(s)
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="max-h-96 overflow-y-auto">
          <DiffViewer segments={simulation.diff} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <form action={action}>
            <AlertDialogAction type="submit">Confirmer</AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
