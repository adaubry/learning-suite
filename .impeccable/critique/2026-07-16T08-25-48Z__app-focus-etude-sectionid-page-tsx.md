---
target: Écran focus Étude (blurting/Feynman/révision)
total_score: 23
p0_count: 1
p1_count: 2
timestamp: 2026-07-16T08-25-48Z
slug: app-focus-etude-sectionid-page-tsx
---
Method: dual-agent (A: ab638782edc6e008c · B: aa462654f503aeda0)

#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | No sense of "state X of 5" across the whole cycle |
| 2 | Match System / Real World | 2 | FSRS rating buttons ("Again/Hard/Good/Easy") are untranslated English in an all-French UI |
| 3 | User Control and Freedom | 2 | Abandon silently vanishes in the Feynman and bilan states |
| 4 | Consistency and Standards | 3 | Border-not-shadow / ink-does-everything rules hold; docked for radius leak + raw emoji |
| 5 | Error Prevention | 3 | Well-engineered shared submit-lock prevents a documented double-submit incident |
| 6 | Recognition Rather Than Recall | 1 | **The user's own blurting text is never shown during correction** |
| 7 | Flexibility and Efficiency | 3 | Skip-countdown, keyboard fallback, bulk-accept all present |
| 8 | Aesthetic and Minimalist Design | 3 | Genuinely spare; docked for the same radius/emoji slips |
| 9 | Error Recovery | 2 | Correction-failed screen repeats the exact retry-only anti-pattern its own sibling error.tsx was built to avoid |
| 10 | Help and Documentation | 1 | No in-flow explanation of blurting/Feynman/FSRS |
| **Total** | | **23/40** | **Acceptable** |

#### Anti-Patterns Verdict

**LLM assessment**: Mostly clean — no gradient text, glassmorphism, side-stripes, hero-metrics, or box-shadow elevation across any of the 5 states. Colors stay in-palette. Two real, provable deviations: a bare `rounded` leak in 4+ spots (correction-view.tsx:29, error-candidates-panel.tsx:33, feynman-report-view.tsx:62, markdown-viewer.tsx:28/35), and raw emoji glyphs (✅❌⚠️🟡🔊🔇) standing in for the theme's own StatusDot/Badge vocabulary — unstyled, OS-dependent, and invisible to screen readers (`aria-hidden` with no text equivalent).

**Deterministic scan**: One real finding — `gap-puzzle.tsx:173` uses a literal `rgba(0,0,0,.06)` selected-square highlight outside DESIGN.md's token set (advisory severity; low-stakes, a third-party chessboard widget's square overlay, not a themed surface). All 13 other files scanned clean.

**Visual overlays**: Not available — no browser automation tool exposed in this session.

#### Overall Impression

This is the richest and most carefully engineered screen in the app — five genuinely distinct "rooms," a submission-lock pattern built explicitly from real production incidents, and real user agency in rejecting the LLM's error candidates. But it has the single most consequential gap found in this whole critique: at the highest-stakes moment in the entire product — being told what you got wrong — the user cannot see what they actually wrote.

#### What's Working
- The submission-lock engineering across correction-view/feynman-report-view/blurting-editor is unusually disciplined — each comment cites a real production incident it prevents, not speculative hardening.
- The five states genuinely feel like five different rooms (reading/serif prose, isolated writing, structured review, chat, report+rating) rather than one template reskinned.
- The error-candidates "reject, don't just accept" mechanic gives the user real pushback power against LLM judgment — a genuine, non-obvious design win.

#### Priority Issues

**[P0] The user's own blurting text is invisible during correction**
- Why it matters: `session.getCurrentCorrection` never selects `studySession.input`, and `CorrectionView` never receives or renders it — forcing recall-from-memory at the single most emotionally loaded, highest-stakes moment in the app.
- Fix: Select `latest.input` in `session.ts:405-421`, pass it to `CorrectionView`, render it read-only above/beside the diff list.
- Suggested command: `/impeccable harden`

**[P1] Failed-correction screen has no escape, only retry**
- Why it matters: `page.tsx:113-125` offers "Relancer la correction" alone — the sibling `error.tsx` explicitly documents (in its own comment) that retry-only caused a real incident and always pairs it with "Retour à l'accueil." This screen repeats the exact anti-pattern, risking a soft-lock since an open cycle blocks starting a new session elsewhere.
- Fix: Add the same paired home/abandon link.
- Suggested command: `/impeccable harden`

**[P1] Abandon vanishes in the Feynman and bilan states**
- Why it matters: `page.tsx:141-174` never binds `abandonAction` to FeynmanChat/FeynmanReportView, unlike every earlier state — breaks control/freedom consistency exactly where sessions run longest; "Quitter" alone doesn't close the underlying cycle.
- Fix: Wire the same abandon pattern through both states.
- Suggested command: `/impeccable adapt`

**[P2] Bare `rounded` leaks non-zero radius past the zero-radius rule**
- Why it matters: correction-view.tsx:29, error-candidates-panel.tsx:33, feynman-report-view.tsx:62, markdown-viewer.tsx:28/35 — the same repo-wide pattern found on every other screen.
- Fix: Swap to `rounded-lg`/`rounded-none`.
- Suggested command: `/impeccable polish`

**[P2] Raw emoji substitute for the design system's status vocabulary**
- Why it matters: Unstyled, OS-dependent, off the token system, and invisible to screen readers (aria-hidden with no text equivalent) on the app's most important screen.
- Fix: Replace with Astryx StatusDot/Badge in the committed five-hue palette.
- Suggested command: `/impeccable polish`

#### Persona Red Flags

**Sam (Accessibility)**: Push-to-talk is a genuine accessibility win (icon+color+text state, always-available keyboard fallback, real hidden labels). But diff/error-candidate status (couvert/manquant/déformé) is conveyed only by an `aria-hidden` emoji — a screen-reader user gets the explanation text but never the pass/fail verdict itself. GapPuzzle is click/drag-only with no confirmed keyboard path (mitigated by being fully skippable).

**Riley (Stress Tester)**: Refresh mid-correction is safe (correction is computed synchronously before redirect). But a repeatedly-failing correction (LLM outage) traps the user in a retry loop with no formal way to close the cycle from that screen — matches the P1 above.

**Jordan (First-Timer)**: Hits "Bilan Feynman" and untranslated "Again/Hard/Good/Easy" rating buttons with zero in-flow explanation of either the Feynman technique or spaced-repetition rating; also encounters an unexplained chess puzzle at the lecture→blurting transition.

#### Minor Observations
- FSRS rating labels are untranslated English (fsrs-rating-bar.tsx:20) in an otherwise all-French UI.
- No elapsed-time indicator during voice recording (blurting has one, push-to-talk doesn't).
- No "state X of 5" progress marker across the whole cycle.
- `gap-puzzle.tsx:173`'s off-token rgba highlight is real but low-stakes — a one-line token swap if full compliance is wanted.

#### Questions to Consider
- Was dropping the user's own blurting text from CorrectionView a deliberate call (echoing the 2026-07-15 decision to remove the side-by-side diff from relecture ciblée), or is it an oversight worth a DECISIONS.md entry either way?
- Was omitting abandon from Feynman/bilan intentional ("once you're this deep, you finish"), or should it be wired for consistency?
- Should the failed-correction screen be brought under error.tsx's retry+escape precedent, or is there a reason it was built separately?
