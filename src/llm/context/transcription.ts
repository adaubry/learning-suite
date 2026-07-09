import type { EmphasisSegment } from "@/core/parser/types";

// L6 · ContextBuilder Transcription (ARCHITECTURE §9 ligne 6) — fonction pure :
// glossaire de vocabulaire juridique = titre de section + segments gras, rien
// d'autre (pas le contenu complet — l'audio ne doit pas se substituer au cours).

export interface TranscriptionContextInput {
  section: {
    titre: string;
    segmentsGras: EmphasisSegment[];
  };
}

export interface TranscriptionContext {
  glossaire: string[];
}

export function buildTranscriptionContext(input: TranscriptionContextInput): TranscriptionContext {
  return {
    glossaire: [input.section.titre, ...input.section.segmentsGras.map((s) => s.text)],
  };
}
