import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// ponytail: tests d'intégration contre le Postgres local (supabase start) —
// pas une suite exhaustive par table, juste le garde-fou que le schéma tient.
// Les canaris (invariants FUNCTIONS §7 qui doivent rester verts en
// permanence) sont dans schema.canary.test.ts.

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client, { schema });

let userId: string;
let subjectId: string;
let chapterId: string;
let sectionId: string;

beforeAll(async () => {
  const [user] = await client`
    insert into auth.users (id) values (gen_random_uuid()) returning id
  `;
  userId = user.id;

  [{ id: subjectId }] = await db
    .insert(schema.subject)
    .values({ userId, nom: "Test", semestre: "S1", ordre: 1 })
    .returning({ id: schema.subject.id });

  [{ id: chapterId }] = await db
    .insert(schema.chapter)
    .values({ subjectId, titre: "Chap", markdown: "# x", contentHash: "h" })
    .returning({ id: schema.chapter.id });

  [{ id: sectionId }] = await db
    .insert(schema.section)
    .values({
      chapterId,
      chapterVersion: 1,
      titre: "Sec",
      ordre: 1,
      niveauSource: 1,
      contenu: "...",
      importance: 3,
    })
    .returning({ id: schema.section.id });
});

afterAll(async () => {
  await db.delete(schema.correctionGuide).where(eq(schema.correctionGuide.sectionId, sectionId));
  await db.delete(schema.section).where(eq(schema.section.id, sectionId));
  await db.delete(schema.chapter).where(eq(schema.chapter.id, chapterId));
  await db.delete(schema.subject).where(eq(schema.subject.id, subjectId));
  await client`delete from auth.users where id = ${userId}`;
  await client.end();
});

describe("contraintes DB (FUNCTIONS §7)", () => {
  it("rejette une importance hors 1..5", async () => {
    await expect(
      db.insert(schema.section).values({
        chapterId,
        chapterVersion: 1,
        titre: "Invalide",
        ordre: 2,
        niveauSource: 1,
        contenu: "...",
        importance: 6,
      }),
    ).rejects.toThrow();
  });

  it("interdit un second CorrectionGuide non-obsolète pour la même section", async () => {
    await db.insert(schema.correctionGuide).values({
      sectionId,
      chapterVersion: 1,
      contenu: {},
      statut: "valide",
    });

    await expect(
      db.insert(schema.correctionGuide).values({
        sectionId,
        chapterVersion: 1,
        contenu: {},
        statut: "a_valider",
      }),
    ).rejects.toThrow();
  });
});
