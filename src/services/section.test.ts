import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as account from "./account";
import * as section from "./section";
import { db } from "@/db";
import { chapter, section as sectionTable } from "@/db/schema";

// S2 · SectioningService — LLM toujours mocké (fetch), Postgres réel (pattern guide.test.ts).

const client = postgres(process.env.DATABASE_URL!);
const createdUserIds: string[] = [];

async function createUser() {
  const [user] = await client`insert into "user" (name, email) values ('Test', gen_random_uuid()::text || '@example.com') returning id`;
  createdUserIds.push(user.id);
  return user.id as string;
}

const MARKDOWN = [
  "# Chapitre",
  "",
  "## Partie 1",
  "",
  "Contenu **important** un.",
  "",
  "## Partie 2",
  "",
  "Contenu deux avec *un commentaire*.",
  "",
].join("\n");

function mockSectioningResponse(sections: unknown[]) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ sections }) } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }),
  };
}

const TWO_SECTIONS_ONE_TO_ONE = [
  { debut_index: 1, fin_index: 1, titre_labelise: "Partie 1", justification: "j" },
  { debut_index: 2, fin_index: 2, titre_labelise: "Partie 2", justification: "j" },
];

let userId: string;
let subjectId: string;
let chapterId: string;

beforeEach(async () => {
  process.env.LLM_MODEL_SECTIONNEMENT = "test/sectioningService";

  userId = await createUser();
  const s = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
  subjectId = s.id;
  const [c] = await db
    .insert(chapter)
    .values({ subjectId, titre: "Chap 1", markdown: MARKDOWN, version: 1, contentHash: "h" })
    .returning();
  chapterId = c.id;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await client`delete from prompt_log where model = 'test/sectioningService'`;
  for (const id of createdUserIds) {
    await client`delete from section where chapter_id in (select id from chapter where subject_id in (select id from subject where user_id = ${id}))`;
    await client`delete from chapter where subject_id in (select id from subject where user_id = ${id})`;
    await client`delete from subject where user_id = ${id}`;
    await client`delete from "user" where id = ${id}`;
  }
  await client.end();
});

describe("section · S2", () => {
  describe("propose", () => {
    it("crée les sections a_trier depuis la sortie LLM, contenu et segments réancrés sur l'extrait", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockSectioningResponse(TWO_SECTIONS_ONE_TO_ONE)));

      const { sections: rows, method } = await section.propose(userId, chapterId);

      expect(method).toBe("llm");
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.titre)).toEqual(["Partie 1", "Partie 2"]);
      expect(rows.map((r) => r.ordre)).toEqual([1, 2]);
      expect(rows.every((r) => r.statut === "a_trier")).toBe(true);
      expect(rows.every((r) => r.importance === 3)).toBe(true);
      expect(rows.every((r) => r.chapterVersion === 1)).toBe(true);
      expect(rows.every((r) => r.niveauSource === 2)).toBe(true);

      const partie1 = rows[0];
      expect(partie1.contenu).toContain("Partie 1");
      const gras = partie1.segmentsGras as { text: string; start: number; end: number }[];
      expect(gras).toHaveLength(1);
      expect(gras[0].text).toBe("important");
      expect(partie1.contenu.slice(gras[0].start, gras[0].end)).toBe("**important**");

      const partie2 = rows[1];
      const commentaires = partie2.commentaires as { text: string; start: number; end: number }[];
      expect(commentaires).toHaveLength(1);
      expect(commentaires[0].text).toBe("un commentaire");
      expect(partie2.contenu.slice(commentaires[0].start, commentaires[0].end)).toBe("*un commentaire*");
    });

    it("secours P6 : appel LLM en échec ⇒ sectionnement mécanique, jamais bloquant", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "boom" } }) }),
      );

      const { sections: rows, method } = await section.propose(userId, chapterId);

      expect(method).toBe("mecanique");
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.titre)).toEqual(["Partie 1", "Partie 2"]);
      expect(rows.every((r) => r.statut === "a_trier")).toBe(true);
    });

    it("refuse un chapitre qui n'appartient pas à l'utilisateur", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockSectioningResponse(TWO_SECTIONS_ONE_TO_ONE)));
      const other = await createUser();
      await expect(section.propose(other, chapterId)).rejects.toThrow("Chapitre introuvable.");
    });

    it("relance : remplace les a_trier de la tentative précédente sans les dupliquer", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockSectioningResponse(TWO_SECTIONS_ONE_TO_ONE)));
      const first = await section.propose(userId, chapterId);
      const second = await section.propose(userId, chapterId);

      expect(first.sections.map((s) => s.id)).not.toEqual(second.sections.map((s) => s.id));
      const all = await db.query.section.findMany({ where: eq(sectionTable.chapterId, chapterId) });
      expect(all).toHaveLength(2);
    });
  });

  describe("applyTriage", () => {
    async function proposeTwo() {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockSectioningResponse(TWO_SECTIONS_ONE_TO_ONE)));
      const { sections: rows } = await section.propose(userId, chapterId);
      vi.unstubAllGlobals();
      return rows;
    }

    it("keep : renomme, fixe l'importance, exclue si importance = 1", async () => {
      const [p1, p2] = await proposeTwo();

      await section.applyTriage(userId, {
        chapterId,
        operations: [
          { kind: "keep", sectionId: p1.id, titre: "Partie 1 renommée", importance: 4 },
          { kind: "keep", sectionId: p2.id, titre: "Partie 2", importance: 1 },
        ],
      });

      const updated1 = await db.query.section.findFirst({ where: eq(sectionTable.id, p1.id) });
      const updated2 = await db.query.section.findFirst({ where: eq(sectionTable.id, p2.id) });
      expect(updated1?.titre).toBe("Partie 1 renommée");
      expect(updated1?.statut).toBe("active");
      expect(updated2?.statut).toBe("exclue");
    });

    it("merge : fusionne deux sections, concatène contenu/segments, archive les sources", async () => {
      const [p1, p2] = await proposeTwo();

      await section.applyTriage(userId, {
        chapterId,
        operations: [{ kind: "merge", sectionIds: [p1.id, p2.id], titre: "Fusion", importance: 3 }],
      });

      const archived1 = await db.query.section.findFirst({ where: eq(sectionTable.id, p1.id) });
      const archived2 = await db.query.section.findFirst({ where: eq(sectionTable.id, p2.id) });
      expect(archived1?.statut).toBe("archivee");
      expect(archived2?.statut).toBe("archivee");

      const all = await db.query.section.findMany({ where: eq(sectionTable.chapterId, chapterId) });
      const mergedRow = all.find((r) => r.statut === "active")!;
      expect(mergedRow.titre).toBe("Fusion");
      expect(mergedRow.parentIds).toEqual([p1.id, p2.id]);
      expect(mergedRow.contenu).toBe(`${p1.contenu}\n\n${p2.contenu}`);

      const gras = mergedRow.segmentsGras as { text: string; start: number; end: number }[];
      expect(gras[0].text).toBe("important");
      expect(mergedRow.contenu.slice(gras[0].start, gras[0].end)).toBe("**important**");
    });

    it("split : scinde une section au point de coupe, archive la source", async () => {
      const [p1] = await proposeTwo();
      const cut = p1.contenu.indexOf("important");

      await section.applyTriage(userId, {
        chapterId,
        operations: [
          {
            kind: "split",
            sectionId: p1.id,
            cutOffset: cut,
            titres: ["Avant", "Après"],
            importances: [3, 2],
          },
        ],
      });

      const archived = await db.query.section.findFirst({ where: eq(sectionTable.id, p1.id) });
      expect(archived?.statut).toBe("archivee");

      const children = (
        await db.query.section.findMany({ where: eq(sectionTable.chapterId, chapterId) })
      ).filter((r) => r.parentIds?.includes(p1.id));
      expect(children).toHaveLength(2);
      const [avant, apres] = children.sort((a, b) => a.ordre - b.ordre);
      expect(avant.titre).toBe("Avant");
      expect(apres.titre).toBe("Après");
      expect(avant.contenu + apres.contenu).toBe(p1.contenu);
    });

    it("rejeu : ré-appliquer le même merge ne duplique pas la section fusionnée", async () => {
      const [p1, p2] = await proposeTwo();
      const operations = [
        { kind: "merge" as const, sectionIds: [p1.id, p2.id] as [string, string], titre: "Fusion", importance: 3 },
      ];

      await section.applyTriage(userId, { chapterId, operations });
      await section.applyTriage(userId, { chapterId, operations });

      const all = await db.query.section.findMany({ where: eq(sectionTable.chapterId, chapterId) });
      expect(all.filter((r) => r.titre === "Fusion")).toHaveLength(1);
    });

    it("refuse une section qui n'appartient pas au chapitre", async () => {
      const [p1] = await proposeTwo();
      const otherChapterRows = await db
        .insert(chapter)
        .values({ subjectId, titre: "Autre", markdown: "# x", contentHash: "h2" })
        .returning();

      await expect(
        section.applyTriage(userId, {
          chapterId: otherChapterRows[0].id,
          operations: [{ kind: "keep", sectionId: p1.id, titre: "x", importance: 3 }],
        }),
      ).rejects.toThrow("Section introuvable.");
    });
  });
});
