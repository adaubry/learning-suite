import Link from "next/link";

// U2 FocusShell (FUNCTIONS §6.1, ARCHITECTURE §10) — le sanctuaire : aucune
// navigation rendue ici (garanti par composition, pas par CSS). Sortie = simple
// lien : la sauvegarde est déjà faite côté serveur avant tout appel LLM (S4),
// il n'y a rien de plus à faire en quittant.

export function FocusShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8">
      <Link href="/" className="self-start text-sm text-secondary hover:underline">
        ← Quitter
      </Link>
      {children}
    </div>
  );
}
