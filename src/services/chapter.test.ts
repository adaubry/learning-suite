import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { db } from "@/db";
import { chapter as chapterTable, section, reviewCard, correctionGuide } from "@/db/schema";
import * as chapter from "./chapter";
import * as account from "./account";
import * as guide from "./guide";
import { anomalyKey } from "@/core/parser/validateDocument";

// ponytail: même pattern que account.test.ts — un utilisateur/matière jetables par test.

const client = postgres(process.env.DATABASE_URL!);
const createdUserIds: string[] = [];

async function createUser() {
  const [user] = await client`
    insert into auth.users (id) values (gen_random_uuid()) returning id
  `;
  createdUserIds.push(user.id);
  return user.id as string;
}

let userId: string;
let subjectId: string;

beforeEach(async () => {
  userId = await createUser();
  const s = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
  subjectId = s.id;
});

afterAll(async () => {
  for (const id of createdUserIds) {
    await client`delete from audit_event where entite_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id}))`;
    await client`delete from review_card where section_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from correction_guide where section_id in (select id from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id})))`;
    await client`delete from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id}))`;
    await client`delete from chapter where subject_id in (select id from subject where user_id = ${id})`;
    await client`delete from subject where user_id = ${id}`;
    await client`delete from auth.users where id = ${id}`;
  }
  await client.end();
});

const propre = "# Chapitre\n\n## Partie\n\n**Point important.**\n\n*commentaire*\n";
const avecAnomalie = "# Chapitre\n\n## Partie\n\n#### Sous-section orpheline\n\nTexte.\n";

describe("chapter · S1 partiel", () => {
  it("analyzeMarkdown renvoie l'arbre et les anomalies sans rien persister", () => {
    const { parsed, anomalies } = chapter.analyzeMarkdown(avecAnomalie);
    expect(parsed.titleTree.length).toBeGreaterThan(0);
    expect(anomalies.some((a) => a.type === "hierarchie_non_descendante")).toBe(true);
  });

  it("importChapter crée le Chapter v1 quand il n'y a aucune anomalie", async () => {
    const created = await chapter.importChapter(userId, {
      subjectId,
      titre: "Introduction",
      markdown: propre,
      acknowledgedAnomalyKeys: [],
    });
    expect(created.version).toBe(1);
    expect(created.statut).toBe("actif");
  });

  it("importChapter refuse une anomalie non acquittée", async () => {
    await expect(
      chapter.importChapter(userId, {
        subjectId,
        titre: "Introduction",
        markdown: avecAnomalie,
        acknowledgedAnomalyKeys: [],
      }),
    ).rejects.toThrow(chapter.AnomaliesNonAcquitteesError);
  });

  it("importChapter accepte quand toutes les anomalies sont acquittées et journalise", async () => {
    const { anomalies } = chapter.analyzeMarkdown(avecAnomalie);
    const created = await chapter.importChapter(userId, {
      subjectId,
      titre: "Introduction",
      markdown: avecAnomalie,
      acknowledgedAnomalyKeys: anomalies.map(anomalyKey),
    });
    expect(created.version).toBe(1);

    const events = await client`select * from audit_event where entite_id = ${created.id}`;
    expect(events).toHaveLength(anomalies.length);
    expect(events[0].type).toBe("acquittement_anomalie");
  });

  it("importChapter refuse une matière d'un autre utilisateur", async () => {
    const other = await createUser();
    await expect(
      chapter.importChapter(other, {
        subjectId,
        titre: "Introduction",
        markdown: propre,
        acknowledgedAnomalyKeys: [],
      }),
    ).rejects.toThrow("Matière introuvable.");
  });

  it("listChaptersBySubject liste les chapitres d'une matière", async () => {
    await chapter.importChapter(userId, {
      subjectId,
      titre: "Introduction",
      markdown: propre,
      acknowledgedAnomalyKeys: [],
    });
    const list = await chapter.listChaptersBySubject(subjectId);
    expect(list.map((c) => c.titre)).toEqual(["Introduction"]);
  });
});

// Bloc 8.2 — S1.simulateUpdate/commitUpdate (ARCHITECTURE §7). Contenu réel
// repris de e2e/evals/fixtures/Introduction obli.md.

function bloc(titre: string, corps: string): string {
  return `## ${titre}\n\n${corps}`;
}

const SOURCES_TITRE = "Sources du droit des obligations";
const SOURCES_CORPS = "À ne pas confondre avec les sources des obligations elles-mêmes.";
const NOTION_TITRE = "Notion d'obligation";
const NOTION_CORPS =
  "L'obligation au sens juridique repose sur une relation entre le créancier et le débiteur.";
const EFFET_TITRE = "L'effet relatif du contrat";
const EFFET_CORPS = "Le contrat ne produit d'effet qu'entre les parties qui l'ont conclu.";

const point = () => ({
  type: "critique",
  intitule: "Point critique",
  attendu: "Attendu secret",
  segments_couverts: [],
});

describe("chapter · S1.simulateUpdate/commitUpdate", () => {
  it("simulateUpdate : hash identique ⇒ changed=false, rien de calculé", async () => {
    const markdown = `# Introduction\n\n${bloc(SOURCES_TITRE, SOURCES_CORPS)}`;
    const chap = await chapter.importChapter(userId, {
      subjectId,
      titre: "Introduction",
      markdown,
      acknowledgedAnomalyKeys: [],
    });
    const sim = await chapter.simulateUpdate(userId, chap.id, markdown);
    expect(sim).toEqual({
      changed: false,
      versionActuelle: 1,
      versionSuivante: 1,
      intactes: 0,
      rubriquesInvalidees: 0,
      nouvelles: 0,
      archivees: 0,
      diff: [],
    });
  });

  it("commitUpdate : hash identique ⇒ changed=false, aucune écriture", async () => {
    const markdown = `# Introduction\n\n${bloc(SOURCES_TITRE, SOURCES_CORPS)}`;
    const chap = await chapter.importChapter(userId, {
      subjectId,
      titre: "Introduction",
      markdown,
      acknowledgedAnomalyKeys: [],
    });
    const result = await chapter.commitUpdate(userId, chap.id, markdown);
    expect(result).toEqual({ changed: false });
    const chapApres = await db.query.chapter.findFirst({ where: eq(chapterTable.id, chap.id) });
    expect(chapApres?.version).toBe(1);
  });

  it("simulateUpdate : compte intactes/rubriquesInvalidees/nouvelles/archivees et fournit le diff", async () => {
    const markdownV1 = `# Introduction\n\n${bloc(SOURCES_TITRE, SOURCES_CORPS)}\n\n${bloc(NOTION_TITRE, NOTION_CORPS)}`;
    const chap = await chapter.importChapter(userId, {
      subjectId,
      titre: "Introduction",
      markdown: markdownV1,
      acknowledgedAnomalyKeys: [],
    });
    await db.insert(section).values([
      {
        chapterId: chap.id,
        chapterVersion: 1,
        titre: SOURCES_TITRE,
        ordre: 1,
        niveauSource: 2,
        contenu: bloc(SOURCES_TITRE, SOURCES_CORPS),
        importance: 3,
        statut: "active",
      },
      {
        chapterId: chap.id,
        chapterVersion: 1,
        titre: NOTION_TITRE,
        ordre: 2,
        niveauSource: 2,
        contenu: bloc(NOTION_TITRE, NOTION_CORPS),
        importance: 3,
        statut: "active",
      },
    ]);

    const notionModifiee = bloc(NOTION_TITRE, `${NOTION_CORPS} Phrase ajoutée.`);
    const conclusion = bloc("Conclusion", "Section entièrement nouvelle.");
    const markdownV2 = `# Introduction\n\n${notionModifiee}\n\n${conclusion}`;

    const sim = await chapter.simulateUpdate(userId, chap.id, markdownV2);
    expect(sim.changed).toBe(true);
    expect(sim.versionActuelle).toBe(1);
    expect(sim.versionSuivante).toBe(2);
    expect(sim.intactes).toBe(0);
    expect(sim.rubriquesInvalidees).toBe(1); // Notion... modifiée
    expect(sim.nouvelles).toBe(1); // Conclusion
    expect(sim.archivees).toBe(1); // Sources... disparue
    expect(sim.diff.length).toBeGreaterThan(0);

    // simulateUpdate est en lecture seule : rien n'a bougé en base.
    const chapApres = await db.query.chapter.findFirst({ where: eq(chapterTable.id, chap.id) });
    expect(chapApres?.version).toBe(1);
  });

  it("commitUpdate : applique intacte/modifiée/disparue/nouvelle et le badge « cours modifié » dérivé", async () => {
    const markdownV1 = `# Introduction\n\n${bloc(SOURCES_TITRE, SOURCES_CORPS)}\n\n${bloc(NOTION_TITRE, NOTION_CORPS)}\n\n${bloc(EFFET_TITRE, EFFET_CORPS)}`;
    const chap = await chapter.importChapter(userId, {
      subjectId,
      titre: "Introduction",
      markdown: markdownV1,
      acknowledgedAnomalyKeys: [],
    });

    const [sourcesSec] = await db
      .insert(section)
      .values({
        chapterId: chap.id,
        chapterVersion: 1,
        titre: SOURCES_TITRE,
        ordre: 1,
        niveauSource: 2,
        contenu: bloc(SOURCES_TITRE, SOURCES_CORPS),
        importance: 3,
        statut: "active",
      })
      .returning();
    const [notionSec] = await db
      .insert(section)
      .values({
        chapterId: chap.id,
        chapterVersion: 1,
        titre: NOTION_TITRE,
        ordre: 2,
        niveauSource: 2,
        contenu: bloc(NOTION_TITRE, NOTION_CORPS),
        importance: 3,
        statut: "active",
      })
      .returning();
    const [effetSec] = await db
      .insert(section)
      .values({
        chapterId: chap.id,
        chapterVersion: 1,
        titre: EFFET_TITRE,
        ordre: 3,
        niveauSource: 2,
        contenu: bloc(EFFET_TITRE, EFFET_CORPS),
        importance: 3,
        statut: "active",
      })
      .returning();

    const g = await guide.createManual(userId, notionSec.id);
    await guide.validate(userId, g.id, [point()]);
    await db.insert(reviewCard).values({
      sectionId: effetSec.id,
      due: new Date().toISOString().slice(0, 10),
      stability: 1,
      difficulty: 1,
    });

    const sourcesInchangee = bloc(SOURCES_TITRE, SOURCES_CORPS);
    const notionModifiee = bloc(NOTION_TITRE, `${NOTION_CORPS} Phrase ajoutée.`);
    const conclusion = bloc("Conclusion", "Section entièrement nouvelle ajoutée au ré-import.");
    const markdownV2 = `# Introduction\n\n${sourcesInchangee}\n\n${notionModifiee}\n\n${conclusion}`;

    const result = await chapter.commitUpdate(userId, chap.id, markdownV2);
    expect(result).toEqual({ changed: true, version: 2 });

    const chapApres = await db.query.chapter.findFirst({ where: eq(chapterTable.id, chap.id) });
    expect(chapApres?.version).toBe(2);

    const sourcesApres = await db.query.section.findFirst({ where: eq(section.id, sourcesSec.id) });
    expect(sourcesApres?.statut).toBe("active"); // conservé
    expect(sourcesApres?.contenu).toBe(sourcesSec.contenu); // conservé à la lettre
    expect(sourcesApres?.chapterVersion).toBe(2); // bookkeeping mis à jour

    const notionApres = await db.query.section.findFirst({ where: eq(section.id, notionSec.id) });
    expect(notionApres?.statut).toBe("prete"); // conservé (pas re-décidé par la cascade)
    expect(notionApres?.contenu).toContain("Phrase ajoutée");
    expect(notionApres?.chapterVersion).toBe(2);
    const notionGuideApres = await db.query.correctionGuide.findFirst({ where: eq(correctionGuide.id, g.id) });
    expect(notionGuideApres?.statut).toBe("obsolete");
    expect(notionGuideApres?.chapterVersion).toBe(1); // ancré à l'ancienne version — signal du badge

    const effetApres = await db.query.section.findFirst({ where: eq(section.id, effetSec.id) });
    expect(effetApres?.statut).toBe("archivee");
    const effetCard = await db.query.reviewCard.findFirst({ where: eq(reviewCard.sectionId, effetSec.id) });
    expect(effetCard?.gelee).toBe(true);

    const toutes = await db.query.section.findMany({ where: eq(section.chapterId, chap.id) });
    const nouvelle = toutes.find((s) => s.titre === "Conclusion");
    expect(nouvelle?.statut).toBe("a_trier");
    expect(nouvelle?.chapterVersion).toBe(2);
  });

  it("commitUpdate refuse un chapitre d'un autre utilisateur", async () => {
    const markdown = `# Introduction\n\n${bloc(SOURCES_TITRE, SOURCES_CORPS)}`;
    const chap = await chapter.importChapter(userId, {
      subjectId,
      titre: "Introduction",
      markdown,
      acknowledgedAnomalyKeys: [],
    });
    const other = await createUser();
    await expect(
      chapter.commitUpdate(other, chap.id, `${markdown}\n\nModifié.`),
    ).rejects.toThrow("Chapitre introuvable.");
  });
});
