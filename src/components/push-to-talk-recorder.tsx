"use client";

import { useRef, useState } from "react";
import { Mic, Square, Keyboard, RotateCcw } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { TextArea } from "@astryxdesign/core/TextArea";

// U20 PushToTalkRecorder (FUNCTIONS §6.2, USER_FLOW É3.3, PLAN Bloc 7.1) — micro
// verrouillable (clic = start, clic = stop) → L6 (transcribeAction) → transcript
// éditable avant envoi → bascule clavier toujours visible. L'audio ne survit
// jamais à la confirmation : gardé en mémoire (state React, Object URL révoqué)
// le temps de la transcription/ré-écoute, jamais persisté côté serveur.

// MediaRecorder ne garantit pas son mimeType par défaut selon le navigateur
// (Chrome : webm, Safari : mp4) — on demande explicitement le premier type
// supporté plutôt que de deviner (risque signalé en récitation Bloc 7.1 : le
// spike 7.0 n'a testé qu'un mp3 pré-enregistré, pas une sortie MediaRecorder réelle).
const CANDIDATE_MIME_TYPES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

function formatFromMimeType(mimeType: string): string {
  return mimeType.split(";")[0].split("/")[1];
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

type Status = "idle" | "recording" | "transcribing" | "error";

export function PushToTalkRecorder({
  cycleId,
  transcribeAction,
  onConfirm,
}: {
  cycleId: string;
  transcribeAction: (
    cycleId: string,
    audioBase64: string,
    audioFormat: string,
  ) => Promise<{ transcript?: string; error?: string }>;
  onConfirm: (text: string) => void;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [keyboardMode, setKeyboardMode] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const lastBlobRef = useRef<{ blob: Blob; format: string } | null>(null);

  function discardAudio() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    lastBlobRef.current = null;
  }

  async function startRecording() {
    setError(null);
    const mimeType = pickMimeType();
    if (!mimeType) {
      setError("Micro non supporté par ce navigateur — utilise le clavier.");
      setKeyboardMode(true);
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const format = formatFromMimeType(mimeType);
      lastBlobRef.current = { blob, format };
      setAudioUrl(URL.createObjectURL(blob));
      void transcribe(blob, format);
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setStatus("recording");
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  async function transcribe(blob: Blob, format: string) {
    setStatus("transcribing");
    const audioBase64 = await blobToBase64(blob);
    const result = await transcribeAction(cycleId, audioBase64, format);
    if (result.error) {
      setStatus("error");
      setError(result.error);
      return;
    }
    setTranscript((prev) => (prev ? `${prev} ${result.transcript}` : (result.transcript ?? "")));
    setStatus("idle");
  }

  function retry() {
    if (!lastBlobRef.current) return;
    setError(null);
    void transcribe(lastBlobRef.current.blob, lastBlobRef.current.format);
  }

  function confirm() {
    onConfirm(transcript.trim());
    setTranscript("");
    discardAudio();
  }

  return (
    <div className="flex flex-col gap-3">
      {!keyboardMode && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="lg"
            isIconOnly
            icon={status === "recording" ? <Square size={18} /> : <Mic size={18} />}
            variant={status === "recording" ? "destructive" : "primary"}
            onClick={status === "recording" ? stopRecording : startRecording}
            isDisabled={status === "transcribing"}
            label={status === "recording" ? "Arrêter l'enregistrement" : "Enregistrer"}
          />
          <span className="text-sm text-secondary">
            {status === "recording" && "Enregistrement en cours…"}
            {status === "transcribing" && "Transcription…"}
            {status === "idle" && "Clique pour parler"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            icon={<Keyboard size={16} />}
            label="Clavier"
            onClick={() => setKeyboardMode(true)}
          />
        </div>
      )}
      {keyboardMode && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-end"
          icon={<Mic size={16} />}
          label="Micro"
          onClick={() => setKeyboardMode(false)}
        />
      )}

      {error && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-error">
          <span>Erreur de transcription : {error}</span>
          {audioUrl && <audio src={audioUrl} controls className="h-8" />}
          <Button type="button" variant="secondary" size="sm" icon={<RotateCcw size={16} />} label="Réessayer" onClick={retry} />
        </div>
      )}

      <TextArea
        label="Transcript"
        isLabelHidden
        value={transcript}
        onChange={setTranscript}
        placeholder="Le transcript apparaît ici — modifiable avant envoi…"
        className="min-h-[15vh]"
      />
      <Button
        type="button"
        className="self-end"
        isDisabled={!transcript.trim() || status === "recording" || status === "transcribing"}
        label="Envoyer"
        onClick={confirm}
      />
    </div>
  );
}
