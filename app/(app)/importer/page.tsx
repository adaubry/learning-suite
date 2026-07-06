import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listSubjects } from "@/services/account";
import { ImportWizard } from "./import-wizard";

// P1 Import (É1.0–É1.2, USER_FLOW) — U23 ImportWizard.
// É1.3 (sectionnement LLM) n'existe pas encore (Phase 3) : ce bloc s'arrête à
// la création du Chapter v1 (DECISIONS.md).

export default async function ImporterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const subjects = await listSubjects(user.id);
  const activeSubjects = subjects.filter((s) => s.statut === "active");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold">Importer un chapitre</h1>
      <ImportWizard subjects={activeSubjects.map((s) => ({ id: s.id, nom: s.nom }))} />
    </div>
  );
}
