"use client";

import { useRef } from "react";
import { ChevronDown } from "lucide-react";
import { IconButton } from "@astryxdesign/core/IconButton";

// ScrollToBottomButton — bulle flottante partagée par LectureView et
// CourseEditor (contenus longs). Remonte au premier ancêtre réellement
// scrollable plutôt que de supposer window vs conteneur interne : les pages
// (app)/ scrollent dans le conteneur interne d'AppShell (height="fill"),
// les pages (focus)/ scrollent la fenêtre (FocusShell = simple div).

function scrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    if (
      node.scrollHeight > node.clientHeight &&
      /(auto|scroll)/.test(getComputedStyle(node).overflowY)
    ) {
      return node;
    }
  }
  return null;
}

export function ScrollToBottomButton() {
  const ref = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    const target = scrollableAncestor(ref.current);
    if (target)
      target.scrollTo({ top: target.scrollHeight, behavior: "smooth" });
    else
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  return (
    <div ref={ref} className="fixed bottom-6 right-6 z-50 outline-1">
      <IconButton
        label="Aller en bas de la page"
        tooltip="Aller en bas"
        icon={<ChevronDown size={18} />}
        onClick={scrollToBottom}
      />
    </div>
  );
}
