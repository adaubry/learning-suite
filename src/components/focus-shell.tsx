import Link from "next/link";
import { cn } from "@/lib/utils";

// U2 FocusShell (FUNCTIONS §6.1, ARCHITECTURE §10) — le sanctuaire : aucune
// navigation rendue ici (garanti par composition, pas par CSS). Sortie = simple
// lien : la sauvegarde est déjà faite côté serveur avant tout appel LLM (S4),
// il n'y a rien de plus à faire en quittant.

export function FocusShell({
  children,
  wide,
}: {
  children: React.ReactNode;
  /** U25 LectureView uniquement : la marge de notes (AnnotatedCourse) a besoin
   * de plus que max-w-2xl. Tous les autres écrans (blurting/correction/
   * Feynman/bilan) restent sur la largeur de lecture par défaut. */
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex min-h-screen w-full flex-col gap-6 px-4 py-8",
        wide ? "max-w-svw" : "max-w-2xl",
      )}
    >
      <Link
        href="/"
        className={cn(
          "self-start text-sm text-secondary hover:underline",
          wide && "xl:mx-auto xl:w-full xl:max-w-[40rem]",
        )}
      >
        ← Quitter
      </Link>
      {children}
    </div>
  );
}
