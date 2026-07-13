"use client";

import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Button } from "@astryxdesign/core/Button";
import { markdownToTiptapDoc, tiptapDocToMarkdown } from "@/components/course-editor-markdown";

// U4 CourseEditor (FUNCTIONS §6.1, TECH_MAPPING §5) — WYSIWYG façon Google Docs, limité à
// Titres 1–3/gras/italique à la SAISIE (barre d'outils = boutons H1/H2/H3 uniquement, gras+
// italique jamais combinables sur un même bouton) ; le schéma accepte 1–6 pour ne jamais perdre
// un vrai chapitre déjà importé (récitation Bloc 8.3 — TECH_MAPPING §5 point 1 porte sur la
// saisie, pas sur la fidélité d'un document existant). Blockquote/code/règle horizontale/barré/
// souligné désactivés au niveau du schéma (pas seulement de la barre d'outils).
//
// Le gras+italique combinés restent saisissables au clavier (Ctrl+B puis Ctrl+I) — ProseMirror
// n'expose pas d'exclusion de marks via `.configure()` sans étendre l'extension. Filet de
// sécurité identique à l'import : `grasItaliqueAmbigu` (P2) détecte et signale le cas dans
// AnomalyPanel avant sauvegarde, comme FORMAT §2.5 le prévoit déjà pour les documents importés.

const extensions = [
  StarterKit.configure({
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    underline: false,
    heading: { levels: [1, 2, 3, 4, 5, 6] },
  }),
];

export function CourseEditor({
  initialMarkdown,
  onChange,
}: {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
}) {
  const editor = useEditor({
    extensions,
    content: markdownToTiptapDoc(initialMarkdown) as JSONContent,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(tiptapDocToMarkdown(editor.getJSON())),
  });

  if (!editor) return null;

  const headingButton = (level: 1 | 2 | 3) => (
    <Button
      key={level}
      type="button"
      size="sm"
      label={`Titre ${level}`}
      variant={editor.isActive("heading", { level }) ? "secondary" : "ghost"}
      onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
    />
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1 rounded border border-border p-1">
        {[1, 2, 3].map((l) => headingButton(l as 1 | 2 | 3))}
        <Button
          type="button"
          size="sm"
          label="Gras"
          variant={editor.isActive("bold") ? "secondary" : "ghost"}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <Button
          type="button"
          size="sm"
          label="Italique"
          variant={editor.isActive("italic") ? "secondary" : "ghost"}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <Button
          type="button"
          size="sm"
          label="Liste"
          variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
      </div>
      {/* Tailwind reset dépouille headings/listes de tout style par défaut (pas de plugin
          Typography — TECH_MAPPING §4.2) : mêmes classes que MarkdownViewer (U3) réappliquées
          ici, en sélecteurs descendants faute de contrôler le rendu HTML de ProseMirror nœud
          par nœud. Sans ça, les titres/listes basculent bien de balise (h1/ul réels, round-trip
          correct) mais restent visuellement identiques au texte courant — d'où l'impression que
          « l'éditeur ne marche pas ». */}
      <EditorContent
        editor={editor}
        className="min-h-96 rounded border border-border p-3 text-sm
          [&_.tiptap]:leading-relaxed [&_.tiptap]:outline-none
          [&_.tiptap_h1]:mt-4 [&_.tiptap_h1]:mb-2 [&_.tiptap_h1]:text-2xl [&_.tiptap_h1]:font-bold
          [&_.tiptap_h2]:mt-4 [&_.tiptap_h2]:mb-2 [&_.tiptap_h2]:text-xl [&_.tiptap_h2]:font-semibold
          [&_.tiptap_h3]:mt-3 [&_.tiptap_h3]:mb-2 [&_.tiptap_h3]:text-lg [&_.tiptap_h3]:font-semibold
          [&_.tiptap_h4]:mt-3 [&_.tiptap_h4]:mb-1 [&_.tiptap_h4]:text-base [&_.tiptap_h4]:font-semibold
          [&_.tiptap_h5]:mt-2 [&_.tiptap_h5]:mb-1 [&_.tiptap_h5]:text-base [&_.tiptap_h5]:font-medium
          [&_.tiptap_h6]:mt-2 [&_.tiptap_h6]:mb-1 [&_.tiptap_h6]:text-sm [&_.tiptap_h6]:font-medium
          [&_.tiptap_p]:my-2
          [&_.tiptap_ul]:my-2 [&_.tiptap_ul]:ml-6 [&_.tiptap_ul]:list-disc
          [&_.tiptap_ol]:my-2 [&_.tiptap_ol]:ml-6 [&_.tiptap_ol]:list-decimal
          [&_.tiptap_li]:my-1
          [&_.tiptap_a]:text-primary [&_.tiptap_a]:underline"
      />
    </div>
  );
}
