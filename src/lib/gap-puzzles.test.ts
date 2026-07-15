import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import puzzles from "./gap-puzzles.json";

describe("gap-puzzles.json", () => {
  it("a au moins un puzzle", () => {
    expect(puzzles.length).toBeGreaterThan(0);
  });

  it("chaque séquence de coups (UCI) est légale et se termine en échec et mat", () => {
    for (const { fen, moves } of puzzles) {
      const game = new Chess(fen);
      const coups = moves.split(" ");
      for (const uci of coups) {
        const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined });
        expect(move, `coup illégal ${uci} sur ${fen}`).not.toBeNull();
      }
      expect(game.isCheckmate(), `pas de mat en fin de séquence pour ${fen}`).toBe(true);
    }
  });
});
