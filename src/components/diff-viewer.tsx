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
  ajoute: "border-green-ring",
  supprime: "border-red-ring",
  modifie: "border-orange-ring",
  inchange: "border-border",
};

function MotsInline({ mots }: { mots: NonNullable<DiffSegment["mots"]> }) {
  return (
    <p className="whitespace-pre-wrap leading-relaxed">
      {mots.map((m, i) =>
        m.added ? (
          <ins key={i} className="rounded-none bg-green-subtle no-underline">
            {m.value}
          </ins>
        ) : m.removed ? (
          <del key={i} className="rounded-none bg-red-subtle">
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
    return <p className="text-sm text-secondary">Aucun changement de contenu détecté.</p>;
  }

  return (
    <div className="space-y-3">
      {pertinents.map((s, i) => (
        <div key={`${s.titre}-${i}`} className={cn("rounded-md border-l-4 bg-muted/30 p-3 text-sm", BORDER[s.type])}>
          <div className="mb-1 flex items-center gap-2">
            <span className="font-medium">{s.titre}</span>
            <span className="text-xs text-secondary">{LABEL[s.type]}</span>
          </div>
          {s.type === "modifie" && s.mots && <MotsInline mots={s.mots} />}
          {s.type === "ajoute" && <p className="whitespace-pre-wrap leading-relaxed">{s.nouveauContenu}</p>}
          {s.type === "supprime" && (
            <p className="whitespace-pre-wrap leading-relaxed text-secondary line-through">{s.ancienContenu}</p>
          )}
        </div>
      ))}
    </div>
  );
}
