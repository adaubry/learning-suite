import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listSubjects } from "@/services/account";
import { AddSubjectForm, SubjectCard } from "./curriculum-ui";

// P6 É6.0 — U22 CurriculumTree minimal : matières uniquement, l'arbre
// chapitres/sections est vide tant que P1 (import) n'est pas construit.

export default async function CurriculumPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const subjects = await listSubjects(user.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold">Curriculum</h1>

      <AddSubjectForm />

      {subjects.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune matière pour l&apos;instant.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {subjects.map((subject) => (
            <SubjectCard key={subject.id} subject={subject} />
          ))}
        </div>
      )}
    </div>
  );
}
