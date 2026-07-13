"use client";

import { cloneElement, useState, type MouseEvent, type ReactElement } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter, HStack } from "@astryxdesign/core/Layout";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
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
  trigger: ReactElement<{ onClick?: (e: MouseEvent) => void }>;
  simulation: UpdateSimulation;
  action: () => Promise<void>;
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
      <Dialog isOpen={open} onOpenChange={setOpen} width={672} purpose="required">
        <Layout
          header={
            <DialogHeader
              title={`Version ${simulation.versionActuelle} → ${simulation.versionSuivante}`}
              onOpenChange={() => setOpen(false)}
            />
          }
          content={
            <LayoutContent>
              <Text type="body">
                {simulation.intactes} intacte(s) · {simulation.rubriquesInvalidees} rubrique(s) invalidée(s) ·{" "}
                {simulation.nouvelles} nouvelle(s) à trier · {simulation.archivees} archivée(s)
              </Text>
              <DiffViewer segments={simulation.diff} />
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label="Annuler" variant="secondary" onClick={() => setOpen(false)} />
                <form action={action}>
                  <Button type="submit" label="Confirmer" variant="primary" />
                </form>
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}
