import Link from "next/link";
import { Badge } from "@astryxdesign/core/Badge";
import type { AttentionBadge as AttentionBadgeData } from "@/services/planner";

const LABEL: Record<AttentionBadgeData["type"], string> = {
  rubriques_a_valider: "rubrique(s) à valider",
  cours_modifie: "section(s) au cours modifié",
  chapitres_non_tries: "chapitre(s) jamais trié(s)",
  archivage_suggere: "matière(s) à archiver",
};

// U12 AttentionBadges (FUNCTIONS §6) — chaque badge, lien direct vers l'écran
// de résolution.
export function AttentionBadges({ badges }: { badges: AttentionBadgeData[] }) {
  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((b) => (
        <Link key={b.type} href="/curriculum">
          <Badge variant="warning" label={`${b.count} ${LABEL[b.type]}`} />
        </Link>
      ))}
    </div>
  );
}
