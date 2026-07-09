import { callTranscription } from "@/llm/client";
import type { TranscriptionContext } from "@/llm/context/transcription";

// L6 · transcribeAudio (FUNCTIONS §2, PLAN Bloc 7.1) — audio + glossaire de section
// → transcript brut, édité par l'utilisateur avant envoi (U20). L'audio n'est
// jamais persisté : il transite en base64 dans la requête, rien d'autre.

export function transcribeAudio(
  context: TranscriptionContext,
  audioBase64: string,
  audioFormat: string,
): Promise<string> {
  return callTranscription({
    promptVersion: "v1",
    context,
    audioBase64,
    audioFormat,
  });
}
