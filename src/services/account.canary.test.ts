import { afterAll, describe, expect, it } from "vitest";
import * as account from "./account";
import * as review from "./review";
import { client, cleanupAll, seedSet } from "@/test/fixtures";

// @canary — export JSON re-parsable complet : rien perdu au round-trip,
// archives comprises. Un canari rouge invalide la modification qui l'a cassé
// (AGENTS §2.5).

afterAll(cleanupAll);

describe("account · exportUserData (@canary)", () => {
  it("export JSON re-parsable complet : rien perdu au round-trip, archives comprises", async () => {
    const { userId, subject, fiches } = await seedSet();
    const archived = await account.createSubject(userId, { nom: "Droit pénal", semestre: "S1" });
    await account.archiveSubject(userId, archived.id);

    const f = fiches[0].id;
    await review.createOrRate(userId, f, "good");
    const [cycle] = await client`insert into study_cycle (user_id, fiche_id, type, etat, note, closed_at) values (${userId}, ${f}, 'etude', 'clos', 'good', now()) returning id`;
    const [t] = await client`insert into tentative (cycle_id, fiche_id, fiche_hash, numero, input, verdict) values (${cycle.id}, ${f}, 'h', 1, 'Restitution', 'insuffisant') returning id`;
    await client`insert into error_entry (subject_id, fiche_id, tentative_id, type, description) values (${subject.id}, ${f}, ${t.id}, 'omission', 'Point manquant')`;

    const data = await account.exportUserData(userId);
    const roundTripped = JSON.parse(JSON.stringify(data)) as typeof data;

    const collections = [
      "subjects",
      "ficheSets",
      "fiches",
      "reviewCards",
      "studyCycles",
      "tentatives",
      "errorEntries",
      "promptLogs",
    ] as const;
    for (const key of collections) {
      expect(Array.isArray(roundTripped[key]), key).toBe(true);
      expect(roundTripped[key], key).toHaveLength(data[key].length);
    }

    expect(roundTripped.version).toBe(2);
    expect(roundTripped.fiches).toHaveLength(3);
    expect(roundTripped.subjects.some((s) => s.statut === "archivee")).toBe(true);
    expect(roundTripped.errorEntries[0].description).toBe("Point manquant");
    expect(roundTripped.tentatives[0].input).toBe("Restitution");
    expect(roundTripped.studyCycles[0].note).toBe("good");
    expect(typeof roundTripped.exportedAt).toBe("string");
  });
});
