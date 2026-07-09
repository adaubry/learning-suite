import type { DiffSegment } from "@/core/diff/diffChapterVersions";
import { cn } from "@/lib/utils";

// U6 DiffViewer (FUNCTIONS §6.1, TECH_MAPPING §4.2 : jsdiff + rendu maison léger). Rend le
// résultat de P5 (diffChapterVersions) — un segment par titre, aligné. É6.3 (ré-import) + É6.1
// (historique). Le surlignage « sera écrasé » (retouches locales non reportées dans le Google
// Doc, USER_FLOW É6.3) n'a encore aucune source de données : il n'existe aucun mécanisme
// écrivant `chapter.markdown` en dehors du ré-import lui-même avant l'éditeur intégré (U4
// Tiptap, Bloc 8.3) — reporté à ce bloc-là plutôt que de bâtir une prop sans appelant.

const LABEL: Record<DiffSegment["type"], string> = {
  ajoute: "Nouvelle section",
  supprime: "Section supprimée",
  modifie: "Section modifiée",
  inchange: "Inchangée",
};

const BORDER: Record<DiffSegment["type"], string> = {
  ajoute: "border-green-400 dark:border-green-700",
  supprime: "border-red-400 dark:border-red-700",
  modifie: "border-amber-400 dark:border-amber-700",
  inchange: "border-border",
};

function MotsInline({ mots }: { mots: NonNullable<DiffSegment["mots"]> }) {
  return (
    <p className="whitespace-pre-wrap leading-relaxed">
      {mots.map((m, i) =>
        m.added ? (
          <ins key={i} className="rounded bg-green-200/60 no-underline dark:bg-green-900/40">
            {m.value}
          </ins>
        ) : m.removed ? (
          <del key={i} className="rounded bg-red-200/60 dark:bg-red-900/40">
            {m.value}
          </del>
        ) : (
          <span key={i}>{m.value}</span>
        ),
      )}
    </p>
  );
}

export function DiffViewer({ segments }: { segments: DiffSegment[] }) {
  const pertinents = segments.filter((s) => s.type !== "inchange");
  if (pertinents.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun changement de contenu détecté.</p>;
  }

  return (
    <div className="space-y-3">
      {pertinents.map((s, i) => (
        <div key={`${s.titre}-${i}`} className={cn("rounded-md border-l-4 bg-muted/30 p-3 text-sm", BORDER[s.type])}>
          <div className="mb-1 flex items-center gap-2">
            <span className="font-medium">{s.titre}</span>
            <span className="text-xs text-muted-foreground">{LABEL[s.type]}</span>
          </div>
          {s.type === "modifie" && s.mots && <MotsInline mots={s.mots} />}
          {s.type === "ajoute" && <p className="whitespace-pre-wrap leading-relaxed">{s.nouveauContenu}</p>}
          {s.type === "supprime" && (
            <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground line-through">{s.ancienContenu}</p>
          )}
        </div>
      ))}
    </div>
  );
}
