import { afterAll, describe, expect, it } from "vitest";
import * as ficheService from "./fiche";
import * as review from "./review";
import { client, cleanupAll, createSubject, createUser, seedSet, SAMPLE_SET } from "@/test/fixtures";

afterAll(cleanupAll);

async function cardOf(ficheId: string) {
  const [row] = await client`select gelee, due::text as due from review_card where fiche_id = ${ficheId}`;
  return row;
}

describe("fiche · import", () => {
  it("importe un set : une fiche par titre 2, statut nouvelle, contenu sans le titre", async () => {
    const { fiches } = await seedSet();
    expect(fiches.map((f) => [f.numero, f.titre, f.statut])).toEqual([
      [1, "La justice retenue", "nouvelle"],
      [2, "La justice déléguée", "nouvelle"],
      [3, "L'arrêt Cadot", "nouvelle"],
    ]);
    const [{ contenu }] = await client`select contenu from fiche where id = ${fiches[0].id}`;
    expect(contenu.startsWith("Sous la justice retenue")).toBe(true);
  });

  it("refuse un document sans fiche (AucuneFicheError), sans rien écrire", async () => {
    const userId = await createUser();
    const subject = await createSubject(userId);
    await expect(
      ficheService.importSet(userId, { subjectId: subject.id, titre: "Vide", markdown: "# Titre\n\nTexte" }),
    ).rejects.toThrow(ficheService.AucuneFicheError);
    const sets = await client`select id from fiche_set where subject_id = ${subject.id}`;
    expect(sets).toEqual([]);
  });

  it("refuse d'importer dans la matière d'un autre utilisateur", async () => {
    const { subject } = await seedSet();
    const autre = await createUser();
    await expect(
      ficheService.importSet(autre, { subjectId: subject.id, titre: "X", markdown: SAMPLE_SET }),
    ).rejects.toThrow();
  });
});

describe("fiche · aperçu", () => {
  it("nouvel import : nombre de points par fiche, complément exclu, pas de statut", async () => {
    const userId = await createUser();
    const apercu = await ficheService.previewImport(userId, SAMPLE_SET);
    expect(apercu.fiches.map((f) => [f.numero, f.nbPoints, f.statut])).toEqual([
      [1, 3, undefined],
      [2, 3, undefined],
      [3, 2, undefined],
    ]);
    expect(apercu.retirees).toEqual([]);
  });

  it("signale une fiche sans thèse", async () => {
    const userId = await createUser();
    const apercu = await ficheService.previewImport(userId, "## 1. A\n\n- **Constat :** x\n");
    expect(apercu.fiches[0].avertissements).toEqual(["Pas de thèse en première ligne."]);
  });

  it("ré-import : statuts inchangée / modifiée / nouvelle et fiches retirées", async () => {
    const { userId, set } = await seedSet();
    const md = SAMPLE_SET.replace("abandon du ministre-juge", "abandon du ministre-juge en 1889").replace(
      /## 2\. La justice déléguée[\s\S]*?(?=## 3)/,
      "## 2. Une fiche neuve\n\nThèse neuve.\n\n",
    );
    const apercu = await ficheService.previewImport(userId, md, set.id);
    expect(apercu.fiches.map((f) => f.statut)).toEqual(["inchangee", "modifiee", "modifiee"]);
  });

  it("ré-import : une fiche absente du document est listée comme retirée", async () => {
    const { userId, set } = await seedSet();
    const md = SAMPLE_SET.split("## 3.")[0];
    const apercu = await ficheService.previewImport(userId, md, set.id);
    expect(apercu.retirees).toEqual([{ numero: 3, titre: "L'arrêt Cadot" }]);
  });
});

describe("fiche · archivage et suppression", () => {
  it("archiver un set gèle ses cartes ; désarchiver les dégèle", async () => {
    const { userId, set, fiches } = await seedSet();
    await review.createOrRate(userId, fiches[0].id, "good");
    await client`update fiche set statut = 'en_revision' where id = ${fiches[0].id}`;

    await ficheService.archiveSet(userId, set.id);
    expect((await cardOf(fiches[0].id)).gelee).toBe(true);

    await ficheService.unarchiveSet(userId, set.id);
    expect((await cardOf(fiches[0].id)).gelee).toBe(false);
  });

  it("désarchiver un set dont la matière est archivée laisse les cartes gelées", async () => {
    const { userId, set, subject, fiches } = await seedSet();
    await review.createOrRate(userId, fiches[0].id, "good");
    await ficheService.archiveSet(userId, set.id);
    await client`update subject set statut = 'archivee', archived_at = now() where id = ${subject.id}`;

    await ficheService.unarchiveSet(userId, set.id);
    expect((await cardOf(fiches[0].id)).gelee).toBe(true);
  });

  it("supprimer un set efface fiches, cartes, sessions, tentatives et erreurs", async () => {
    const { userId, set, subject, fiches } = await seedSet();
    const f = fiches[0].id;
    await review.createOrRate(userId, f, "good");
    const [cycle] = await client`insert into study_cycle (user_id, fiche_id, type, etat, closed_at) values (${userId}, ${f}, 'etude', 'clos', now()) returning id`;
    const [t] = await client`insert into tentative (cycle_id, fiche_id, fiche_hash, numero, input) values (${cycle.id}, ${f}, 'h', 1, 'x') returning id`;
    await client`insert into error_entry (subject_id, fiche_id, tentative_id, type, description) values (${subject.id}, ${f}, ${t.id}, 'confusion', 'x')`;

    await ficheService.deleteSet(userId, set.id);
    for (const table of ["fiche", "review_card", "tentative", "error_entry"]) {
      const col = table === "fiche" ? "id" : "fiche_id";
      const rows = await client`select 1 from ${client(table)} where ${client(col)} = ${f}`;
      expect(rows, table).toEqual([]);
    }
    expect(await client`select 1 from fiche_set where id = ${set.id}`).toEqual([]);
  });

  it("listFiches et getFiche : carte et historique des cycles notés", async () => {
    const { userId, set, fiches } = await seedSet();
    await review.createOrRate(userId, fiches[1].id, "good");
    const liste = await ficheService.listFiches(userId, set.id);
    expect(liste.map((f) => f.reps)).toEqual([null, 1, null]);

    const detail = await ficheService.getFiche(userId, fiches[1].id);
    expect(detail.card?.reps).toBe(1);
    expect(detail.cycles).toEqual([]);
    expect(detail.set.id).toBe(set.id);
  });
});
