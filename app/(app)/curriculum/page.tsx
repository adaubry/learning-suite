import { requireUserId } from "@/lib/auth";
import { Button } from "@astryxdesign/core/Button";
import { listSubjects } from "@/services/account";
import { listChaptersBySubject, listSectionsByChapter } from "@/services/chapter";
import { AddSubjectDialog, CurriculumFilter, RubricQueuePanel } from "./curriculum-ui";

// P6 É6.0 — U22 CurriculumTree minimal : matières + chapitres + sections.
// Le tri des sections (S2/L1/U13, Phase 3) n'existe toujours pas : les
// sections affichent leur statut brut, sans écran de triage. Bloc 4.2 y
// ajoute l'action rubrique (générer/rédiger) sur les sections `active`.

export default async function CurriculumPage() {
  const userId = await requireUserId();

  const subjects = await listSubjects(userId);
  // ponytail: un listChaptersBySubject par matière — nombre de matières faible
  // (mono-utilisateur), pas de jointure batch tant que ça ne pose pas de problème.
  const subjectsWithChapters = await Promise.all(
    subjects.map(async (subject) => {
      const chapters = await listChaptersBySubject(subject.id);
      const chaptersWithSections = await Promise.all(
        chapters.map(async (chapter) => ({
          ...chapter,
          sections: await listSectionsByChapter(chapter.id),
        })),
      );
      return { subject, chapters: chaptersWithSections };
    }),
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Curriculum</h1>
        <div className="flex flex-wrap gap-2">
          <AddSubjectDialog />
          <Button size="sm" label="Importer un chapitre" href="/importer" />
        </div>
      </div>

      <RubricQueuePanel />

      {subjects.length === 0 ? (
        <p className="text-sm text-secondary">Aucune matière pour l&apos;instant.</p>
      ) : (
        <CurriculumFilter subjectsWithChapters={subjectsWithChapters} />
      )}
    </div>
  );
}
