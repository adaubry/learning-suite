import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import * as audit from "./audit";

const client = postgres(process.env.DATABASE_URL!);

afterAll(async () => {
  await client`delete from audit_event where entite_type = 'test'`;
  await client.end();
});

describe("audit · S8 partiel", () => {
  it("logEvent insère un événement journalisé", async () => {
    const entiteId = crypto.randomUUID();
    await audit.logEvent("acquittement_anomalie", "test", entiteId);

    const [row] = await client`select * from audit_event where entite_id = ${entiteId}`;
    expect(row.type).toBe("acquittement_anomalie");
    expect(row.entite_type).toBe("test");
  });
});
