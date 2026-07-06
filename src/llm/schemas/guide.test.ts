import { describe, expect, it } from "vitest";
import { guideOutputSchema } from "./guide";

describe("guideOutputSchema", () => {
  const point = (type: "critique" | "important" | "secondaire") => ({
    type,
    intitule: "x",
    attendu: "y",
    segments_couverts: [1],
  });

  it("accepte une rubrique avec au moins un point critique", () => {
    expect(guideOutputSchema.safeParse({ points: [point("critique")] }).success).toBe(true);
  });

  it("rejette une rubrique sans point critique", () => {
    const result = guideOutputSchema.safeParse({ points: [point("important"), point("secondaire")] });
    expect(result.success).toBe(false);
  });
});
