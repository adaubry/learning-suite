import { afterAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import * as chapter from "./chapter";
import * as account from "./account";
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
