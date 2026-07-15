"use client";

import { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { PieceDropHandlerArgs, SquareHandlerArgs } from "react-chessboard";
import puzzles from "@/lib/gap-puzzles.json";
import { initAudio, sfx } from "@/lib/gap-sounds";

// U26 GapPuzzle (CHESS.md, extension CHESS2.md) — distracteur cognitif sur
// l'écran d'attente lecture→blurting (lecture-view.tsx), sans notation
// d'aucune sorte, sans retour visuel négatif, sans persistance. Le dataset
// mélange mat-en-1 et mat-en-2 (`moves` a 2 ou 4 demi-coups UCI) : la
// validation compare donc chaque coup joué au prochain demi-coup ATTENDU
// dans la séquence, pas à `isCheckmate()` seul — sinon le premier coup
// correct d'un mat-en-2 serait rejeté comme un coup faux (ni mat, ni la fin
// de la séquence). Coup attendu et intermédiaire → gardé, la réplique
// adverse suivante est rejouée automatiquement, `sfx.move`/`sfx.capture`.
// Coup attendu et final → gardé, `sfx.mate`. Tout le reste (illégal — try/
// catch, chess.js v1 lève au lieu de renvoyer `null` — ou légal mais hors
// séquence) → `undo()`, silence total, comportement identique aux deux cas.

type Puzzle = { fen: string; moves: string };

type GapPuzzleProps = {
  onReady?: () => void;
  onSolved?: () => void;
};

type PartieEnCours = { game: Chess; coups: string[]; prochain: number };

function tirerPuzzle(): Puzzle {
  return puzzles[Math.floor(Math.random() * puzzles.length)] as Puzzle;
}

/** `moves` est en UCI ("e2e4", "e7e8q") — `game.move(string)` attend du SAN, pas de l'UCI. */
function jouerUci(game: Chess, uci: string) {
  return game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined });
}

function demarrerPuzzle(puzzle: Puzzle): PartieEnCours {
  const game = new Chess(puzzle.fen);
  const coups = puzzle.moves.split(" ");
  jouerUci(game, coups[0]);
  return { game, coups, prochain: 1 };
}

function estSombre() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function styleMarqueur(capture: boolean): React.CSSProperties {
  const couleur = estSombre() ? "rgba(255,255,255,.28)" : "rgba(0,0,0,.14)";
  return {
    backgroundImage: capture
      ? `radial-gradient(circle, transparent 78%, ${couleur} 80%)`
      : `radial-gradient(circle, ${couleur} 20%, transparent 22%)`,
  };
}

export function GapPuzzle({ onReady, onSolved }: GapPuzzleProps) {
  const [puzzle, setPuzzle] = useState(() => tirerPuzzle());
  const gameRef = useRef<PartieEnCours | null>(null);
  const [fen, setFen] = useState(() => demarrerPuzzle(puzzle).game.fen());
  const [selected, setSelected] = useState<Square | null>(null);
  const [cibles, setCibles] = useState<{ square: Square; capture: boolean }[]>([]);
  const trait = fen.split(" ")[1] === "w" ? "blancs" : "noirs";
  const orientation = fen.split(" ")[1] === "w" ? "white" : "black";

  useEffect(() => {
    // Amorce l'instance mutable pour le tout premier puzzle ; `avancer()` gère
    // les suivants directement (pas de setState synchrone dans un effet).
    gameRef.current = demarrerPuzzle(puzzle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const game = gameRef.current?.game;
    if (!selected || !game) {
      setCibles([]);
      return;
    }
    setCibles(
      game
        .moves({ square: selected, verbose: true })
        .map((m) => ({ square: m.to as Square, capture: m.captured !== undefined })),
    );
  }, [selected]);

  useEffect(() => {
    onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function avancer() {
    const suivant = tirerPuzzle();
    const etat = demarrerPuzzle(suivant);
    gameRef.current = etat;
    setPuzzle(suivant);
    setFen(etat.game.fen());
    setSelected(null);
  }

  /** Un seul point d'entrée pour tout coup, joué au clic comme au drag (CHESS2.md §2). */
  function tryMove(from: string, to: string): boolean {
    const etat = gameRef.current;
    if (!etat) return false;
    const { game, coups, prochain } = etat;
    let coupJoue;
    try {
      coupJoue = game.move({ from, to, promotion: "q" });
    } catch {
      return false;
    }
    const uci = coupJoue.from + coupJoue.to + (coupJoue.promotion ?? "");
    if (uci !== coups[prochain]) {
      game.undo();
      return false;
    }

    const suivant = prochain + 1;
    if (suivant >= coups.length) {
      setFen(game.fen());
      sfx.mate();
      onSolved?.();
      setTimeout(avancer, 400);
      return true;
    }
    jouerUci(game, coups[suivant]);
    etat.prochain = suivant + 1;
    setFen(game.fen());
    if (coupJoue.captured) sfx.capture();
    else sfx.move();
    return true;
  }

  function onSquareClick({ piece, square }: SquareHandlerArgs) {
    initAudio();
    const etat = gameRef.current;
    if (!etat) return;
    const cible = square as Square;
    const estPieceDuJoueur = piece !== null && piece.pieceType[0] === etat.game.turn();

    if (selected === null) {
      if (estPieceDuJoueur) setSelected(cible);
      return;
    }
    if (cible === selected) {
      setSelected(null);
      return;
    }
    const accepte = tryMove(selected, cible);
    if (accepte) {
      setSelected(null);
    } else {
      setSelected(estPieceDuJoueur ? cible : null);
    }
  }

  function onPieceDrag() {
    initAudio();
    setSelected(null);
  }

  function onPieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs) {
    if (!targetSquare) return false;
    return tryMove(sourceSquare, targetSquare);
  }

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (selected) {
    squareStyles[selected] = { backgroundColor: estSombre() ? "rgba(255,255,255,.10)" : "rgba(0,0,0,.06)" };
  }
  for (const { square, capture } of cibles) {
    squareStyles[square] = styleMarqueur(capture);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs text-secondary">Trait aux {trait}</p>
      <Chessboard
        key={puzzle.fen}
        options={{
          position: fen,
          onPieceDrop,
          onSquareClick,
          onPieceDrag,
          squareStyles,
          boardOrientation: orientation,
          showNotation: false,
          allowDrawingArrows: false,
        }}
      />
    </div>
  );
}
