import { afterAll, describe, expect, it } from "vitest";
import * as ficheService from "./fiche";
import * as review from "./review";
import { client, cleanupAll, seedSet, SAMPLE_SET } from "@/test/fixtures";

// @canary — invariant du ré-import (ARCHITECTURE.md v2 §5, §8) : une fiche
// appariée garde son identité, donc sa carte et son historique FSRS, même quand
// une fiche insérée avant elle décale toute la numérotation. Un canari rouge
// invalide la modification qui l'a cassé, jamais l'inverse (AGENTS §2.5).

afterAll(cleanupAll);

async function state(ficheId: string) {
  const [f] = await client`select id, numero, statut, contenu from fiche where id = ${ficheId}`;
  const [c] = await client`select reps, stability, gelee, due::text as due from review_card where fiche_id = ${ficheId}`;
  return { fiche: f, card: c };
}

describe("ré-import (@canary)", () => {
  it("fiche modifiée et renumérotée par une insertion : même id, carte et historique FSRS intacts", async () => {
    const { userId, set, fiches } = await seedSet();
    const cadot = fiches[2].id;
    await review.createOrRate(userId, cadot, "good");
    await review.rate(userId, cadot, "good");
    await client`update fiche set statut = 'en_revision' where id = ${cadot}`;
    const avant = await state(cadot);

    const md = SAMPLE_SET.replace("## 3. L'arrêt Cadot", "## 3. Une fiche insérée\n\nThèse insérée.\n\n## 4. L'arrêt Cadot").replace(
      "abandon du ministre-juge.",
      "abandon du ministre-juge et de la justice retenue.",
    );
    const res = await ficheService.reimportSet(userId, set.id, md);
    expect(res.nouvelles).toBe(1);

    const apres = await state(cadot);
    expect(apres.fiche.numero).toBe(4);
    expect(apres.fiche.statut).toBe("en_revision");
    expect(apres.fiche.contenu).toContain("et de la justice retenue");
    expect(apres.card).toEqual(avant.card);
  });

  it("fiche retirée ⇒ archivée, carte gelée ; réapparue ⇒ restaurée, carte dégelée", async () => {
    const { userId, set, fiches } = await seedSet();
    const cadot = fiches[2].id;
    await review.createOrRate(userId, cadot, "good");
    await client`update fiche set statut = 'en_revision' where id = ${cadot}`;

    await ficheService.reimportSet(userId, set.id, SAMPLE_SET.split("## 3.")[0]);
    let s = await state(cadot);
    expect(s.fiche.statut).toBe("archivee");
    expect(s.card.gelee).toBe(true);

    await ficheService.reimportSet(userId, set.id, SAMPLE_SET);
    s = await state(cadot);
    expect(s.fiche.statut).toBe("en_revision");
    expect(s.card.gelee).toBe(false);
  });

  it("fiche sans carte retirée puis réapparue : redevient nouvelle", async () => {
    const { userId, set, fiches } = await seedSet();
    await ficheService.reimportSet(userId, set.id, SAMPLE_SET.split("## 3.")[0]);
    await ficheService.reimportSet(userId, set.id, SAMPLE_SET);
    expect((await state(fiches[2].id)).fiche.statut).toBe("nouvelle");
  });
});
