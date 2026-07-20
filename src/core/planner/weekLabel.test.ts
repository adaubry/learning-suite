import { describe, expect, it } from "vitest";
import { weekLabel } from "./weekLabel";

describe("weekLabel · P12", () => {
  it("debutS3 null ⇒ aucun label (empty state de config)", () => {
    expect(weekLabel("2026-07-20", { debutS3: null, debutS4: null })).toBeNull();
  });

  it("semaine 1 du S3 le jour de debutS3", () => {
    expect(weekLabel("2026-01-05", { debutS3: "2026-01-05", debutS4: null })).toBe("s1s3");
  });

  it("semaine 2 du S3, 7 jours après debutS3", () => {
    expect(weekLabel("2026-01-12", { debutS3: "2026-01-05", debutS4: null })).toBe("s2s3");
  });

  it("frontière S3/S4 : la veille de debutS4 reste en S3, le jour même bascule en S4", () => {
    const config = { debutS3: "2026-01-05", debutS4: "2026-05-04" };
    expect(weekLabel("2026-05-03", config)).toBe("s17s3");
    expect(weekLabel("2026-05-04", config)).toBe("s1s4");
  });
});
