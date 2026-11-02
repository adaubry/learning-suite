import { afterAll, describe, expect, it } from "vitest";
import * as ficheService from "./fiche";
import * as planner from "./planner";
import * as review from "./review";
import { client, cleanupAll, seedSet } from "@/test/fixtures";

// @canary : archiver un set l'exclut de la file du jour et gèle ses cartes ;
// désarchiver le fait réapparaître, dégèle, ne recule jamais `due`, et laisse
// l'état FSRS et l'historique intacts.

afterAll(cleanupAll);

async function card(ficheId: string) {
  const [row] = await client`select *, due::text as due from review_card where fiche_id = ${ficheId}`;
  return row;
}

describe("archivage d'un set (@canary)", () => {
  it("archivé ⇒ exclu de la file ; désarchivé ⇒ réapparaît, état FSRS et historique intacts", async () => {
    const { userId, set, fiches } = await seedSet();
    const f = fiches[0].id;
    await review.createOrRate(userId, f, "good");
    await client`update fiche set statut = 'en_revision' where id = ${f}`;
    const [cycle] = await client`insert into study_cycle (user_id, fiche_id, type, etat, note, closed_at) values (${userId}, ${f}, 'etude', 'clos', 'good', now()) returning id`;
    await client`insert into tentative (cycle_id, fiche_id, fiche_hash, numero, input) values (${cycle.id}, ${f}, 'h', 1, 'Restitution')`;
    const avant = await card(f);
    const tentativesAvant = await client`select * from tentative where fiche_id = ${f}`;

    const revisions = async () =>
      (await planner.todayQueue(userId, avant.due)).filter((i) => i.kind === "revision");
    expect(await revisions()).toHaveLength(1);

    await ficheService.archiveSet(userId, set.id);
    expect(await planner.todayQueue(userId, avant.due)).toEqual([]);

    await ficheService.unarchiveSet(userId, set.id);
    expect(await revisions()).toEqual([expect.objectContaining({ kind: "revision", ficheId: f })]);

    const apres = await card(f);
    expect(apres.gelee).toBe(false);
    expect(apres.due >= avant.due).toBe(true);
    for (const k of ["stability", "difficulty", "reps", "lapses"]) expect(apres[k]).toBe(avant[k]);
    expect(await client`select * from tentative where fiche_id = ${f}`).toEqual(tentativesAvant);
  });
});
