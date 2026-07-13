import { describe, expect, it, vi } from "vitest";
import { createRubricQueue } from "./rubric-generation-queue";

// @canary — remplace le verrou local par section fixé en DECISIONS.md (commit
// 2ea9e73, race « générer + rédiger manuellement sur la même section »). Ces
// invariants sont ceux qui empêchaient le crash ; les casser silencieusement
// rouvrirait la même classe de bug.

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("createRubricQueue", () => {
  it("@canary traite les items en attente strictement l'un après l'autre", async () => {
    const first = deferred<{ error?: string } | undefined>();
    const second = deferred<{ error?: string } | undefined>();
    const runner = vi.fn((sectionId: string) => (sectionId === "a" ? first.promise : second.promise));
    const queue = createRubricQueue(runner, runner);

    queue.enqueue("a", "Section A", "generer");
    queue.enqueue("b", "Section B", "generer");

    await Promise.resolve();
    expect(runner).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshot().find((i) => i.sectionId === "a")?.status).toBe("en_cours");
    expect(queue.getSnapshot().find((i) => i.sectionId === "b")?.status).toBe("en_attente");

    first.resolve(undefined);
    await Promise.resolve();
    await Promise.resolve();
    expect(runner).toHaveBeenCalledTimes(2);
    expect(queue.getSnapshot().find((i) => i.sectionId === "a")?.status).toBe("termine");

    second.resolve(undefined);
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.getSnapshot().find((i) => i.sectionId === "b")?.status).toBe("termine");
  });

  it("@canary ignore une nouvelle demande si la section a déjà un item en attente ou en cours", async () => {
    const pending = deferred<{ error?: string } | undefined>();
    const runner = vi.fn(() => pending.promise);
    const queue = createRubricQueue(runner, runner);

    queue.enqueue("a", "Section A", "generer");
    queue.enqueue("a", "Section A", "manuel");
    queue.enqueue("a", "Section A", "generer");

    expect(queue.getSnapshot().filter((i) => i.sectionId === "a")).toHaveLength(1);
    pending.resolve(undefined);
    await Promise.resolve();
    await Promise.resolve();
  });

  it("@canary annuler un item en_attente le retire sans jamais appeler le runner", async () => {
    const first = deferred<{ error?: string } | undefined>();
    const runner = vi.fn(() => first.promise);
    const queue = createRubricQueue(runner, runner);

    queue.enqueue("a", "Section A", "generer");
    queue.enqueue("b", "Section B", "generer");
    const queuedItem = queue.getSnapshot().find((i) => i.sectionId === "b")!;
    queue.cancel(queuedItem.id);

    expect(queue.getSnapshot().find((i) => i.sectionId === "b")).toBeUndefined();
    first.resolve(undefined);
    await Promise.resolve();
    await Promise.resolve();
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("@canary un runner qui échoue marque l'item en erreur sans bloquer les suivants", async () => {
    const runner = vi.fn((sectionId: string) =>
      sectionId === "a" ? Promise.resolve({ error: "boom" }) : Promise.resolve(undefined),
    );
    const queue = createRubricQueue(runner, runner);

    queue.enqueue("a", "Section A", "generer");
    queue.enqueue("b", "Section B", "generer");

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(queue.getSnapshot().find((i) => i.sectionId === "a")).toMatchObject({
      status: "erreur",
      error: "boom",
    });
    expect(queue.getSnapshot().find((i) => i.sectionId === "b")?.status).toBe("termine");
  });
});
