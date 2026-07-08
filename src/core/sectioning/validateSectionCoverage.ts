import type { SectionnementOutput } from "@/llm/schemas/sectionnement";

// L1 · validation post-LLM (FUNCTIONS §2 : bornes vérifiées côté code, chevauchement/
// trou/dépassement ⇒ retry). Les bornes du modèle sont des indices 1-based dans le
// plan (candidateHeadings), pas des offsets caractère : une couverture valide est
// une partition exacte et ordonnée de 1..candidateCount, sans trou ni chevauchement.

export function validateSectionCoverage(output: SectionnementOutput, candidateCount: number): string | null {
  const sorted = [...output.sections].sort((a, b) => a.debut_index - b.debut_index);
  let expected = 1;
  for (const s of sorted) {
    if (s.debut_index > s.fin_index) {
      return `section invalide : debut_index (${s.debut_index}) > fin_index (${s.fin_index}).`;
    }
    if (s.debut_index !== expected) {
      return `couverture incohérente (trou ou chevauchement) : un titre devait commencer à l'index ${expected}, section reçue à ${s.debut_index}.`;
    }
    expected = s.fin_index + 1;
  }
  if (expected !== candidateCount + 1) {
    return `couverture incomplète : ${candidateCount} titres à couvrir, la dernière section s'arrête à l'index ${expected - 1}.`;
  }
  return null;
}
