"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { PushToTalkRecorder } from "@/components/push-to-talk-recorder";

// U19 FeynmanChat (FUNCTIONS §6.2, USER_FLOW É3.3, PLAN Bloc 7.2) — bulles,
// streaming des relances (L4 via /api/feynman/turn), TTS optionnel
// (speechSynthesis natif), compose U20 (transcript éditable, bascule clavier
// déjà gérée par PushToTalkRecorder). [Clore et demander le bilan] appelle un
// Server Action classique (L5 n'est pas streamé, sortie JSON unique) — invoqué
// depuis un event handler, donc dans startTransition (obligatoire hors <form>,
// cf. node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md).

interface FeynmanMessage {
  role: "etudiant" | "ia";
  texte: string;
}

async function* streamTurn(body: object): AsyncGenerator<string> {
  const res = await fetch("/api/feynman/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    throw new Error((await res.text().catch(() => "")) || "Erreur du dialogue Feynman.");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    yield decoder.decode(value, { stream: true });
  }
}

export function FeynmanChat({
  cycleId,
  sectionTitre,
  transcribeAction,
  closeFeynmanAction,
}: {
  cycleId: string;
  sectionTitre: string;
  transcribeAction: (
    cycleId: string,
    audioBase64: string,
    audioFormat: string,
  ) => Promise<{ transcript?: string; error?: string }>;
  closeFeynmanAction: () => Promise<void>;
}) {
  const [messages, setMessages] = useState<FeynmanMessage[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [closing, startClosing] = useTransition();
  const openedRef = useRef(false);

  function speak(text: string) {
    if (!ttsEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }

  async function runTurn(gen: AsyncGenerator<string>) {
    setError(null);
    setStreaming("");
    let full = "";
    try {
      for await (const chunk of gen) {
        full += chunk;
        setStreaming(full);
      }
      setMessages((prev) => [...prev, { role: "ia", texte: full }]);
      speak(full);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur du dialogue Feynman.");
    } finally {
      setStreaming(null);
    }
  }

  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    void runTurn(streamTurn({ mode: "opening", cycleId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleConfirm(text: string) {
    if (!text) return;
    setMessages((prev) => [...prev, { role: "etudiant", texte: text }]);
    void runTurn(streamTurn({ mode: "turn", cycleId, transcript: text }));
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">{sectionTitre}</h1>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => setTtsEnabled((v) => !v)}
        >
          {ttsEnabled ? "🔊 Lecture activée" : "🔇 Lecture désactivée"}
        </Button>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[80%] rounded-lg p-3 text-sm ${
              m.role === "ia" ? "self-start bg-muted" : "self-end bg-primary text-primary-foreground"
            }`}
          >
            {m.texte}
          </div>
        ))}
        {streaming !== null && (
          <div className="max-w-[80%] self-start rounded-lg bg-muted p-3 text-sm">{streaming || "…"}</div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <PushToTalkRecorder cycleId={cycleId} transcribeAction={transcribeAction} onConfirm={handleConfirm} />

      <Button
        type="button"
        variant="outline"
        className="self-end"
        disabled={closing || streaming !== null}
        onClick={() => startClosing(() => closeFeynmanAction())}
      >
        {closing ? "…" : "Clore et demander le bilan"}
      </Button>
    </div>
  );
}
