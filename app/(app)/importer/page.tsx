import { requireUserId } from "@/lib/auth";
import { listSubjects } from "@/services/account";
import * as ficheService from "@/services/fiche";
import { ImportWizard } from "./import-wizard";

// Import d'un set de fiches (USER_FLOW.md v2) — `?set=<id>` ouvre directement le
// ré-import de ce set (lien depuis le curriculum).

export default async function ImporterPage({ searchParams }: { searchParams: Promise<{ set?: string }> }) {
  const userId = await requireUserId();
  const { set } = await searchParams;

  const [subjects, sets] = await Promise.all([listSubjects(userId), ficheService.listSets(userId)]);
  const activeSubjects = subjects.filter((s) => s.statut === "active");
  const nomById = new Map(subjects.map((s) => [s.id, s.nom]));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold">Importer des fiches</h1>
      <ImportWizard
        subjects={activeSubjects.map((s) => ({ id: s.id, nom: s.nom }))}
        sets={sets.map((s) => ({ id: s.id, label: `${nomById.get(s.subjectId) ?? ""} — ${s.titre}` }))}
        initialSetId={sets.some((s) => s.id === set) ? set! : ""}
      />
    </div>
  );
}
