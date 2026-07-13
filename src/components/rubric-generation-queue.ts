// Remplace le verrou local par section (`submitting = genPending || manPending`,
// DECISIONS.md commit 2ea9e73) par une file visible, partagée par TOUTES les
// sections de /curriculum : un seul appel en vol à la fois, les suivants
// attendent leur tour, annulables tant qu'ils n'ont pas démarré. L'invariant
// protégé est le même qu'avant (générer + rédiger manuellement créent la même
// rubrique pour une section — index unique en base, guide.ts) : `enqueue`
// ignore toute nouvelle demande tant qu'une autre est en attente/en cours pour
// la même section.
//
// Module pur, sans dépendance à Next.js/Server Actions : les deux appels
// réseau sont injectés (`generer`/`manuel`), ce qui le rend testable en Vitest
// sans mock lourd et respecte le sens de dépendance components/ → server
// actions (ce module ne doit pas importer un fichier actions.ts précis).
// `createRubricQueue` reste une fonction (pas un singleton de module) pour que
// chaque test canary tourne sur sa propre file, isolée des autres.

export type RubricQueueKind = "generer" | "manuel";
export type RubricQueueStatus = "en_attente" | "en_cours" | "termine" | "erreur";

export type RubricQueueItem = {
  id: string;
  sectionId: string;
  sectionTitre: string;
  kind: RubricQueueKind;
  status: RubricQueueStatus;
  error?: string;
};

export type RubricQueueRunner = (sectionId: string) => Promise<{ error?: string } | undefined>;

export function isRubricSectionQueued(items: RubricQueueItem[], sectionId: string) {
  return items.some(
    (i) => i.sectionId === sectionId && (i.status === "en_attente" || i.status === "en_cours"),
  );
}

export function createRubricQueue(generer: RubricQueueRunner, manuel: RubricQueueRunner) {
  let items: RubricQueueItem[] = [];
  const listeners = new Set<() => void>();
  let processing = false;

  function update(fn: (items: RubricQueueItem[]) => RubricQueueItem[]) {
    items = fn(items);
    for (const listener of listeners) listener();
  }

  async function processQueue() {
    if (processing) return;
    processing = true;
    let next: RubricQueueItem | undefined;
    while ((next = items.find((i) => i.status === "en_attente"))) {
      const current = next;
      update((items) => items.map((i) => (i.id === current.id ? { ...i, status: "en_cours" } : i)));

      const runner = current.kind === "generer" ? generer : manuel;
      let result: RubricQueueItem;
      try {
        const outcome = await runner(current.sectionId);
        result = outcome?.error
          ? { ...current, status: "erreur", error: outcome.error }
          : { ...current, status: "termine" };
      } catch (e) {
        result = { ...current, status: "erreur", error: e instanceof Error ? e.message : "Erreur." };
      }
      update((items) => items.map((i) => (i.id === current.id ? result : i)));
    }
    processing = false;
  }

  function enqueue(sectionId: string, sectionTitre: string, kind: RubricQueueKind) {
    if (isRubricSectionQueued(items, sectionId)) return;
    update((items) => [...items, { id: crypto.randomUUID(), sectionId, sectionTitre, kind, status: "en_attente" }]);
    void processQueue();
  }

  function cancel(id: string) {
    update((items) => items.filter((i) => !(i.id === id && i.status === "en_attente")));
  }

  function dismiss(id: string) {
    update((items) => items.filter((i) => i.id !== id));
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function getSnapshot() {
    return items;
  }

  return { enqueue, cancel, dismiss, subscribe, getSnapshot };
}

export type RubricQueue = ReturnType<typeof createRubricQueue>;
