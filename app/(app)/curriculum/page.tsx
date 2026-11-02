import { requireUserId } from "@/lib/auth";
import { Button } from "@astryxdesign/core/Button";
import { listSubjects } from "@/services/account";
import * as ficheService from "@/services/fiche";
import { AddSubjectDialog, CurriculumFilter } from "./curriculum-ui";

// Curriculum v2 : matières → sets de fiches → fiches (USER_FLOW.md v2).

export default async function CurriculumPage() {
  const userId = await requireUserId();

  const [subjects, sets] = await Promise.all([listSubjects(userId), ficheService.listSets(userId)]);
  // ponytail: une requête par set — quelques sets par matière, mono-utilisateur.
  const setsWithFiches = await Promise.all(
    sets.map(async (set) => ({ ...set, fiches: await ficheService.listFiches(userId, set.id) })),
  );
  const subjectsWithSets = subjects.map((subject) => ({
    subject,
    sets: setsWithFiches.filter((s) => s.subjectId === subject.id),
  }));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Fiches</h1>
        <div className="flex flex-wrap gap-2">
          <AddSubjectDialog />
          <Button size="sm" label="Importer des fiches" href="/importer" />
        </div>
      </div>

      {subjects.length === 0 ? (
        <p className="text-sm text-secondary">Aucune matière pour l&apos;instant : ajoute-en une, puis importe un set de fiches.</p>
      ) : (
        <CurriculumFilter subjectsWithSets={subjectsWithSets} />
      )}
    </div>
  );
}
