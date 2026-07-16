"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { AnnotatedCourse } from "@/components/annotated-course";
import { GapPuzzle } from "@/components/gap-puzzle";
import { ScrollToBottomButton } from "@/components/scroll-to-bottom-button";

// U25 LectureView (FUNCTIONS §6.2, USER_FLOW É3.1, REVAMP v2 2026-07-15 ;
// minuteur DECISIONS.md 2026-07-15 « Retour sur lecture structurelle ») —
// écran de Machine B : la lecture du cours est une étape de l'app, deux
// occurrences par cycle (initiale avant blurting_1, ciblée avant blurting_2).
// `[Je suis prêt, je blurte]` bascule vers un compte à rebours de 30s ;
// `[Passer maintenant]` l'interrompt, sinon il déclenche lui-même
// S4.terminerLecture (seule transition lecture→blurting) à expiration. Appel
// hors <form> → useTransition (obligatoire, même pattern que
// feynman-chat.tsx/closeFeynmanAction).
//
// `[Abandonner]` vit ici pour la même raison qu'en blurting-editor.tsx : verrou
// de soumission partagé, les deux mutent le même StudyCycle. Disponible aussi
// pendant le compte à rebours (USER_FLOW É3.1).

const COMPTE_A_REBOURS_SECONDES = 30;

function useCompteARebours(actif: boolean, onExpire: () => void) {
  const [secondes, setSecondes] = useState(COMPTE_A_REBOURS_SECONDES);

  useEffect(() => {
    if (!actif || secondes <= 0) return;
    const id = setTimeout(() => setSecondes((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [actif, secondes]);

  useEffect(() => {
    if (actif && secondes <= 0) onExpire();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif, secondes]);

  return secondes;
}

// Instrument de calibration hors-UI (CHESS.md §9) : temps médian entre deux
// puzzles résolus pendant le compte à rebours, jamais affiché ni persisté.
function useCalibrationGapPuzzle() {
  const temps = useRef<number[]>([]);
  const dernier = useRef<number | null>(null);

  const onReady = () => {
    dernier.current = performance.now();
  };
  const onSolved = () => {
    const maintenant = performance.now();
    if (dernier.current !== null)
      temps.current.push(maintenant - dernier.current);
    dernier.current = maintenant;
  };

  useEffect(() => {
    const echantillons = temps.current;
    return () => {
      const echantillon = [...echantillons].sort((a, b) => a - b);
      if (echantillon.length === 0) return;
      const mediane = echantillon[Math.floor(echantillon.length / 2)];
      console.log(
        `[gap-puzzle] temps médian: ${(mediane / 1000).toFixed(1)}s (n=${echantillon.length})`,
      );
    };
  }, []);

  return { onReady, onSolved };
}

export function LectureView({
  sectionTitre,
  contenu,
  relecture,
  action,
  abandonAction,
}: {
  sectionTitre: string;
  contenu: string;
  /** Relecture ciblée (2ᵉ passe, avant blurting_2) vs lecture initiale — cosmétique (badge). */
  relecture?: boolean;
  action: () => Promise<void>;
  abandonAction: () => Promise<void>;
}) {
  const [pret, setPret] = useState(false);
  const [pending, startTransition] = useTransition();
  const continuer = () => startTransition(() => action());
  const secondes = useCompteARebours(pret && !pending, continuer);
  const { onReady, onSolved } = useCalibrationGapPuzzle();

  if (pret) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <h1 className="text-lg font-semibold">{sectionTitre}</h1>
        <p className="text-sm text-secondary">
          Passage au blurting dans {secondes}s…
        </p>
        <div className="w-full max-w-sm">
          <GapPuzzle onReady={onReady} onSolved={onSolved} />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            isDisabled={pending}
            label="Passer maintenant"
            onClick={continuer}
          />
          <form action={abandonAction}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              isDisabled={pending}
              label="Abandonner"
            />
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-2 xl:mx-auto xl:w-full xl:max-w-[40rem]">
        <h1 className="text-lg font-semibold">{sectionTitre}</h1>
        <Badge
          variant="neutral"
          label={relecture ? "Relecture ciblée" : "Lecture"}
        />
      </div>

      <div className="flex flex-1 flex-col">
        <AnnotatedCourse markdown={contenu} className="font-serif" />
      </div>

      <div className="flex flex-wrap gap-2 xl:mx-auto xl:w-full xl:max-w-[40rem]">
        <Button
          type="button"
          label="Je suis prêt, je blurte"
          onClick={() => setPret(true)}
        />
        <form action={abandonAction}>
          <Button type="submit" variant="ghost" size="sm" label="Abandonner" />
        </form>
      </div>
      <ScrollToBottomButton />
    </div>
  );
}
