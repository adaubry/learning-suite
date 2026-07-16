"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { IconButton } from "@astryxdesign/core/IconButton";
import { MarkdownViewer } from "@/components/markdown-viewer";
import { parseChapter } from "@/core/parser/parseChapter";
import type { TitleNode } from "@/core/parser/types";
import { cn } from "@/lib/utils";

type Note = { id: number; top: number; text: string };

let nextId = 0;

// AnnotatedCourse — U25 LectureView, deux marges pendant la lecture (desktop
// uniquement, `xl` et plus) : à gauche une table des matières flottante, à
// droite des notes libres.
//
// - Sommaire (gauche) : arbre des titres via P1 `parseChapter` (même pipeline
//   remark que U3 MarkdownViewer, donc mêmes offsets `start` que
//   `data-md-start`) aplati en liste ordonnée, dans un panneau distinct
//   (bordure + fond paper, conforme à la règle outline-not-shadow de
//   DESIGN.md — jamais de shadow). `position: sticky; top: 50%` — contraire
//   des notes : il ne fait PAS partie du flux de la page, il reste centré
//   verticalement à l'écran pendant le scroll (la colonne qui le porte est
//   étirée à la hauteur du cours par `align-items: stretch`, comportement par
//   défaut du flex parent, donc le panneau a la place de flotter sur tout le
//   scroll) ; un clic scrolle vers le titre visé.
// - Notes (droite) : un clic sur un bloc du cours (U3 MarkdownViewer, dont
//   chaque bloc top-level porte déjà `data-md-start`/`data-md-end` — même
//   ancrage que U5 AnomalyPanel) pose une note à la hauteur EXACTE de ce bloc,
//   en marge, jamais par-dessus le texte. Le conteneur qui porte la note
//   (`position: relative`) est le même que celui du texte : la note fait
//   partie du flux normal de la page, donc elle suit le scroll comme
//   n'importe quel contenu — pas de `position: fixed`.
//
// Rien de tout ça n'est persisté, ni envoyé au serveur ni à aucun service.

function flattenTitles(nodes: TitleNode[]): TitleNode[] {
  return nodes.flatMap((n) => [n, ...flattenTitles(n.children)]);
}

export function AnnotatedCourse({
  markdown,
  className,
}: {
  markdown: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const headings = useMemo(
    () => flattenTitles(parseChapter(markdown).titleTree),
    [markdown],
  );

  function scrollToHeading(start: number) {
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-md-start="${start}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function addNote(e: React.MouseEvent<HTMLDivElement>) {
    if (window.innerWidth < 1280) return; // pas de marge dispo en dessous de xl
    const block = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-md-start]",
    );
    if (!block) return;
    const top = block.offsetTop;
    setNotes((notes) =>
      notes.some((n) => n.top === top)
        ? notes
        : [...notes, { id: nextId++, top, text: "" }],
    );
  }

  function updateNote(id: number, text: string) {
    setNotes((notes) => notes.map((n) => (n.id === id ? { ...n, text } : n)));
  }

  function removeNote(id: number) {
    setNotes((notes) => notes.filter((n) => n.id !== id));
  }

  // ref stable (jamais recréée) : ne focalise qu'au montage réel du textarea
  // (nouvelle note), jamais aux re-rendus suivants. `autoFocus` natif aurait
  // fait défiler la page horizontalement pour révéler la note en marge — la
  // colonne de cours doit rester figée, d'où `preventScroll`.
  const focusOnMount = useCallback((el: HTMLTextAreaElement | null) => {
    el?.focus({ preventScroll: true });
  }, []);

  return (
    // En dessous de xl : aucune classe ci-dessous ne s'applique, le rendu est
    // un simple <div> de bloc dans la colonne de FocusShell — comportement
    // identique à avant cette fonctionnalité, aucun risque de régression.
    //
    // À partir de xl : rangée à 3 cases fixes — sommaire (14rem) — cours
    // (40rem) — notes (14rem). FocusShell passe en largeur `wide` sur cet
    // écran précisément pour laisser la place à cette rangée (voir U25
    // LectureView/EtudePage) ; les deux cases latérales étant symétriques, le
    // cours reste centré. 40rem = 42rem (max-w-2xl, largeur de lecture des
    // autres écrans) moins `px-4` : même largeur de texte que blurting/
    // correction/Feynman, pour une lecture visuellement cohérente.
    <div className="xl:flex xl:justify-center xl:gap-8">
      <div className="hidden xl:block xl:w-56 xl:shrink-0">
        {headings.length > 0 && (
          <nav
            aria-label="Sommaire du cours"
            className="sticky top-1/4 flex max-h-[70vh] w-full -translate-y-1/2 -translate-x-1/3 flex-col gap-2 overflow-y-auto bg-surface p-4 "
          >
            <p className="border-b border-border pb-2 text-sm font-semibold text-primary">
              Sommaire
            </p>
            {headings.map((h) => (
              <button
                key={h.start}
                type="button"
                title={h.text}
                onClick={() => scrollToHeading(h.start)}
                style={{ paddingLeft: `${0.5 + (h.level - 1) * 0.75}rem` }}
                className="truncate py-1.5 pr-2 text-left text-sm text-primary hover:bg-muted focus-visible:bg-muted"
              >
                {h.text}
              </button>
            ))}
          </nav>
        )}
      </div>

      <div
        ref={containerRef}
        onClick={addNote}
        className="relative cursor-text xl:w-[40rem] xl:shrink-0"
      >
        <MarkdownViewer markdown={markdown} className={className} />
      </div>

      <div className="relative hidden xl:block xl:w-56 xl:shrink-0">
        {notes.map((note) => (
          <div
            key={note.id}
            className="absolute left-4 flex w-52 items-start gap-1"
            style={{ top: note.top }}
          >
            <textarea
              ref={focusOnMount}
              value={note.text}
              onChange={(e) => updateNote(note.id, e.target.value)}
              onBlur={() => {
                if (!note.text.trim()) removeNote(note.id);
              }}
              rows={2}
              placeholder="Note…"
              className={cn(
                "flex-1 resize-none rounded-md border border-border bg-surface p-1 text-xs shadow-sm",
                "focus:outline-none",
              )}
            />
            <IconButton
              label="Supprimer la note"
              tooltip="Supprimer"
              variant="ghost"
              size="sm"
              icon={<X size={12} />}
              onClick={() => removeNote(note.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
