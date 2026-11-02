import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as errorService from "./error";
import { client, cleanupAll, createUser, seedSet } from "@/test/fixtures";

// ErrorService — un utilisateur, un set et une tentative jetables par test.

let userId: string;
let subjectId: string;
let ficheId: string;
let otherFicheId: string;
let tentativeId: string;
let activeErrorId: string;

beforeEach(async () => {
  const s = await seedSet();
  userId = s.userId;
  subjectId = s.subject.id;
  ficheId = s.fiches[0].id;
  otherFicheId = s.fiches[1].id;

  const [cycle] = await client`insert into study_cycle (user_id, fiche_id, type, etat) values (${userId}, ${ficheId}, 'etude', 'correction') returning id`;
  const [t] = await client`insert into tentative (cycle_id, fiche_id, fiche_hash, numero, input) values (${cycle.id}, ${ficheId}, 'h', 1, 'x') returning id`;
  tentativeId = t.id;

  const [active] = await client`insert into error_entry (subject_id, fiche_id, tentative_id, type, description, statut) values (${subjectId}, ${ficheId}, ${tentativeId}, 'omission', 'active', 'active') returning id`;
  activeErrorId = active.id;
  await client`insert into error_entry (subject_id, fiche_id, tentative_id, type, description, statut) values (${subjectId}, ${ficheId}, ${tentativeId}, 'omission', 'resolue', 'resolue')`;
});

afterAll(cleanupAll);

async function setCorrection(erreursCandidates: unknown) {
  await client`update tentative set correction = ${client.json({ points: [], erreursCandidates } as never)} where id = ${tentativeId}`;
}

describe("error", () => {
  it("activeForFiche ne renvoie que les erreurs actives de la fiche", async () => {
    const rows = await errorService.activeForFiche(ficheId);
    expect(rows.map((r) => r.description)).toEqual(["active"]);
    expect(await errorService.activeForFiche(otherFicheId)).toEqual([]);
  });

  describe("commitCandidates", () => {
    it("crée une nouvelle ErrorEntry pour une candidate sans récidive", async () => {
      await setCorrection([{ type: "confusion", description: "nouvelle erreur", idErreurExistante: null }]);
      await errorService.commitCandidates(userId, tentativeId, []);

      const rows = await errorService.list(userId, { ficheId, type: "confusion" });
      expect(rows).toHaveLength(1);
      expect(rows[0].description).toBe("nouvelle erreur");
      expect(rows[0].occurrences).toBe(1);
    });

    it("incrémente occurrences au lieu de dupliquer sur récidive (idErreurExistante)", async () => {
      await setCorrection([{ type: "omission", description: "revu", idErreurExistante: activeErrorId }]);
      await errorService.commitCandidates(userId, tentativeId, []);

      const rows = await errorService.list(userId, { ficheId, statut: "active" });
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(activeErrorId);
      expect(rows[0].occurrences).toBe(2);
    });

    it("index rejeté (rejectedIndexes) ⇒ candidate non committée", async () => {
      await setCorrection([{ type: "confusion", description: "à rejeter", idErreurExistante: null }]);
      await errorService.commitCandidates(userId, tentativeId, [0]);

      const rows = await errorService.list(userId, { ficheId, type: "confusion" });
      expect(rows).toHaveLength(0);
    });

    it("auto-acceptation : un index non explicitement rejeté est committé", async () => {
      await setCorrection([
        { type: "confusion", description: "gardée", idErreurExistante: null },
        { type: "imprecision", description: "rejetée", idErreurExistante: null },
      ]);
      await errorService.commitCandidates(userId, tentativeId, [1]);

      const rows = await errorService.list(userId, { ficheId });
      const descriptions = rows.map((r) => r.description);
      expect(descriptions).toContain("gardée");
      expect(descriptions).not.toContain("rejetée");
    });

    it("refuse une tentative qui n'appartient pas à l'utilisateur", async () => {
      const otherUserId = await createUser();
      await setCorrection([{ type: "confusion", description: "x", idErreurExistante: null }]);
      await expect(errorService.commitCandidates(otherUserId, tentativeId, [])).rejects.toThrow();
    });
  });

  describe("list/resolve/edit/deleteEntry", () => {
    it("list filtre par statut et scope à l'utilisateur", async () => {
      const otherUserId = await createUser();
      const rows = await errorService.list(userId, { statut: "active" });
      expect(rows).toHaveLength(1);
      const otherRows = await errorService.list(otherUserId, { statut: "active" });
      expect(otherRows).toHaveLength(0);
    });

    it("resolve passe le statut à resolue", async () => {
      const updated = await errorService.resolve(userId, activeErrorId);
      expect(updated.statut).toBe("resolue");
    });

    it("reopen repasse une erreur résolue à active", async () => {
      await errorService.resolve(userId, activeErrorId);
      const reopened = await errorService.reopen(userId, activeErrorId);
      expect(reopened.statut).toBe("active");
    });

    it("refuse reopen pour un autre utilisateur", async () => {
      const otherUserId = await createUser();
      await errorService.resolve(userId, activeErrorId);
      await expect(errorService.reopen(otherUserId, activeErrorId)).rejects.toThrow();
    });

    it("list respecte limit/offset (pagination du carnet)", async () => {
      await client`insert into error_entry (subject_id, fiche_id, tentative_id, type, description) values (${subjectId}, ${otherFicheId}, ${tentativeId}, 'omission', 'e2')`;

      const all = await errorService.list(userId, {});
      expect(all.length).toBeGreaterThanOrEqual(2);

      const firstPage = await errorService.list(userId, { limit: 1, offset: 0 });
      expect(firstPage).toHaveLength(1);
      const secondPage = await errorService.list(userId, { limit: 1, offset: 1 });
      expect(secondPage).toHaveLength(1);
      expect(secondPage[0].id).not.toBe(firstPage[0].id);
    });

    it("edit modifie la description", async () => {
      const updated = await errorService.edit(userId, activeErrorId, { description: "corrigée" });
      expect(updated.description).toBe("corrigée");
    });

    it("deleteEntry supprime la ligne", async () => {
      await errorService.deleteEntry(userId, activeErrorId);
      const rows = await errorService.list(userId, { ficheId });
      expect(rows.find((r) => r.id === activeErrorId)).toBeUndefined();
    });

    it("refuse resolve/edit/delete pour un autre utilisateur", async () => {
      const otherUserId = await createUser();
      await expect(errorService.resolve(otherUserId, activeErrorId)).rejects.toThrow();
      await expect(errorService.edit(otherUserId, activeErrorId, { description: "x" })).rejects.toThrow();
      await expect(errorService.deleteEntry(otherUserId, activeErrorId)).rejects.toThrow();
    });
  });
});
