"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@astryxdesign/core/Button";
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
  abandonAction,
  initialMessages,
  initialTtsActive = false,
}: {
  cycleId: string;
  sectionTitre: string;
  transcribeAction: (
    cycleId: string,
    audioBase64: string,
    audioFormat: string,
  ) => Promise<{ transcript?: string; error?: string }>;
  closeFeynmanAction: () => Promise<void>;
  abandonAction: () => Promise<void>;
  /** Historique déjà persisté (S4.feynmanHistorique) — si non vide, ne PAS
   *  rappeler "opening" au montage (page rechargée, retour arrière/avant) :
   *  ça générerait un tour d'ouverture parasite au milieu de l'échange
   *  (incident réel : "Feynman oublie ce que je viens de dire"). */
  initialMessages: FeynmanMessage[];
  /** Réglage de compte P7 (Bloc 9.1) — valeur par défaut du toggle, ensuite libre pour
   *  cette session (le toggle lui-même ne réécrit pas le réglage persisté). */
  initialTtsActive?: boolean;
}) {
  const [messages, setMessages] = useState<FeynmanMessage[]>(initialMessages);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ttsEnabled, setTtsEnabled] = useState(initialTtsActive);
  const [closing, startClosing] = useTransition();
  const [abandoning, startAbandoning] = useTransition();
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
    if (openedRef.current || initialMessages.length > 0) return;
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
          label={ttsEnabled ? "🔊 Lecture activée" : "🔇 Lecture désactivée"}
          onClick={() => setTtsEnabled((v) => !v)}
        />
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[80%] rounded-lg p-3 text-sm ${
              m.role === "ia" ? "self-start bg-muted" : "self-end bg-accent-bg text-on-accent"
            }`}
          >
            {m.texte}
          </div>
        ))}
        {streaming !== null && (
          <div className="max-w-[80%] self-start rounded-lg bg-muted p-3 text-sm">{streaming || "…"}</div>
        )}
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <PushToTalkRecorder cycleId={cycleId} transcribeAction={transcribeAction} onConfirm={handleConfirm} />

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          isDisabled={closing || abandoning}
          label={abandoning ? "…" : "Abandonner"}
          onClick={() => startAbandoning(() => abandonAction())}
        />
        <Button
          type="button"
          variant="secondary"
          isDisabled={closing || abandoning || streaming !== null}
          label={closing ? "…" : "Clore et demander le bilan"}
          onClick={() => startClosing(() => closeFeynmanAction())}
        />
      </div>
    </div>
  );
}
