import { afterAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import * as account from "./account";

// ponytail: tests d'intégration contre le Postgres local (supabase start),
// même pattern que src/db/schema.test.ts — un utilisateur jetable par test.

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

beforeEach(async () => {
  userId = await createUser();
});

afterAll(async () => {
  for (const id of createdUserIds) {
    await client`delete from subject where user_id = ${id}`;
    await client`delete from planner_config where user_id = ${id}`;
    await client`delete from prompt_config where user_id = ${id}`;
    await client`delete from auth.users where id = ${id}`;
  }
  await client.end();
});

describe("account · S9 partiel", () => {
  it("createSubject assigne un ordre incrémental par utilisateur", async () => {
    const s1 = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
    const s2 = await account.createSubject(userId, { nom: "Droit pénal", semestre: "S1" });
    expect(s1.ordre).toBe(1);
    expect(s2.ordre).toBe(2);
  });

  it("listSubjects trie par ordre et ignore les autres utilisateurs", async () => {
    const otherUserId = await createUser();
    await account.createSubject(otherUserId, { nom: "Autre", semestre: "S1" });
    await account.createSubject(userId, { nom: "B", semestre: "S1" });
    await account.createSubject(userId, { nom: "A", semestre: "S1" });

    const list = await account.listSubjects(userId);
    expect(list.map((s) => s.nom)).toEqual(["B", "A"]);
  });

  it("updateSubject modifie une matière, scoping par utilisateur", async () => {
    const other = await createUser();
    const s = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });

    const updated = await account.updateSubject(userId, s.id, { dateExamen: "2026-12-01" });
    expect(updated.dateExamen).toBe("2026-12-01");

    const blocked = await account.updateSubject(other, s.id, { nom: "Piraté" });
    expect(blocked).toBeUndefined();
  });

  it("archiveSubject / unarchiveSubject font l'aller-retour du statut", async () => {
    const s = await account.createSubject(userId, { nom: "Droit civil", semestre: "S1" });
    const archived = await account.archiveSubject(userId, s.id);
    expect(archived.statut).toBe("archivee");

    const restored = await account.unarchiveSubject(userId, s.id);
    expect(restored.statut).toBe("active");
  });

  it("getPlannerConfig renvoie le défaut tant qu'aucune ligne n'existe", async () => {
    const config = await account.getPlannerConfig(userId);
    expect(config.nouvellesParJour).toBe(3);
  });

  it("updatePlannerConfig fait un upsert idempotent", async () => {
    await account.updatePlannerConfig(userId, 5);
    const second = await account.updatePlannerConfig(userId, 7);
    expect(second.nouvellesParJour).toBe(7);

    const read = await account.getPlannerConfig(userId);
    expect(read.nouvellesParJour).toBe(7);
  });

  it("hasCompletedOnboarding bascule après updatePlannerConfig", async () => {
    expect(await account.hasCompletedOnboarding(userId)).toBe(false);
    await account.updatePlannerConfig(userId, 3);
    expect(await account.hasCompletedOnboarding(userId)).toBe(true);
  });

  it("getMethodologieGlobale / updateMethodologieGlobale font l'aller-retour", async () => {
    expect(await account.getMethodologieGlobale(userId)).toBeNull();
    await account.updateMethodologieGlobale(userId, "Les titres suivent le plan...");
    expect(await account.getMethodologieGlobale(userId)).toBe("Les titres suivent le plan...");
  });
});
