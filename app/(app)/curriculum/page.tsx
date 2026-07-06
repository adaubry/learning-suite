import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { listSubjects } from "@/services/account";
import { listChaptersBySubject } from "@/services/chapter";
import { AddSubjectForm, SubjectCard } from "./curriculum-ui";

// P6 É6.0 — U22 CurriculumTree minimal : matières + liste des chapitres
// (titre, statut). L'arbre sections reste vide tant que le sectionnement
// LLM (S2/L1, Phase 3) n'existe pas.

export default async function CurriculumPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const subjects = await listSubjects(user.id);
  // ponytail: un listChaptersBySubject par matière — nombre de matières faible
  // (mono-utilisateur), pas de jointure batch tant que ça ne pose pas de problème.
  const subjectsWithChapters = await Promise.all(
    subjects.map(async (subject) => ({
      subject,
      chapters: await listChaptersBySubject(subject.id),
    })),
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Curriculum</h1>
        <Button size="sm" nativeButton={false} render={<Link href="/importer" />}>
          Importer un chapitre
        </Button>
      </div>

      <AddSubjectForm />

      {subjects.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune matière pour l&apos;instant.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {subjectsWithChapters.map(({ subject, chapters }) => (
            <SubjectCard key={subject.id} subject={subject} chapters={chapters} />
          ))}
        </div>
      )}
    </div>
  );
}
