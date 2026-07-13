import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import * as chapter from "@/services/chapter";
import { ChapterEditorScreen } from "./chapter-editor-screen";

// É6.1 (vue minimale) + É6.2 (éditeur intégré, U4 Tiptap) — Bloc 8.3.

export default async function ChapterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: chapterId } = await params;
  const userId = await requireUserId();

  const chap = await chapter.getChapterForEdit(userId, chapterId).catch(() => null);
  if (!chap) notFound();

  return (
    <ChapterEditorScreen
      chapterId={chap.id}
      titre={chap.titre}
      initialMarkdown={chap.markdown}
      statut={chap.statut}
    />
  );
}
