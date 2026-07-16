---
target: Accueil / File du jour
total_score: 22
p0_count: 0
p1_count: 3
timestamp: 2026-07-16T08-25-47Z
slug: app-app-page-tsx
---
Method: dual-agent (A: abd062f39537a0ea8 · B: ad0655403b7205135)

#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Reorder buttons only dim on submit, no loading spinner |
| 2 | Match System / Real World | 3 | "imp. 3" is an unexplained abbreviation |
| 3 | User Control and Freedom | 2 | No undo for "Reporter" (defer) |
| 4 | Consistency and Standards | 2 | `rounded` class contradicts DESIGN.md's zero-radius rule |
| 5 | Error Prevention | 3 | Low-risk, reversible actions only |
| 6 | Recognition Rather Than Recall | 3 | Icon buttons have proper aria-labels; "imp. 3" undercuts this |
| 7 | Flexibility and Efficiency | 1 | Reordering a long queue is one full-page-submit click at a time, no bulk/drag |
| 8 | Aesthetic and Minimalist Design | 3 | Horizon-chart stats (dette/J7/J30) have identical visual weight despite different urgency |
| 9 | Error Recovery | 2 | No error boundary if `todayQueue`/`horizon` fail |
| 10 | Help and Documentation | 1 | No tooltips for "imp. 3" or badge meanings |
| **Total** | | **22/40** | **Acceptable** |

#### Anti-Patterns Verdict

**LLM assessment**: No templated slop (no gradients, glassmorphism, hero metrics, side-stripes). But the screen fails DESIGN.md's own signature rule: a bare Tailwind `rounded` class on bordered containers (daily-queue.tsx:86, horizon-chart.tsx:17/38) directly contradicts "zero radius except the badge pill." This same pattern repeats in 13 files across the app, confirmed by the detector — a systemic drift, not a one-off.

**Deterministic scan**: Clean — `detect.mjs` found 0 findings across all 5 files. The `rounded` violation above is a real issue the detector's current ruleset doesn't check for (it flags off-palette colors and side-stripes, not bare-vs-suffixed Tailwind radius utilities).

**Visual overlays**: Not available — no browser automation tool is exposed in this session. No live server, injection, or screenshot was attempted.

#### Overall Impression

Functionally solid and visually disciplined (palette stays in-bounds, empty states exist at both levels), but the screen undersells urgency (the "backlog debt" stat has no visual weight) and makes queue reordering painful at any real scale. The zero-radius leak is a small but real crack in the design system's most identity-defining rule.

#### What's Working
- Empty states are handled at both the "no chapters yet" and "queue empty today" levels, each with a clear next action.
- Icon-only reorder buttons correctly get accessible names via Astryx's `label`-as-aria-label contract.
- Palette discipline holds — nothing outside the committed green/red/yellow/blue/gray set appears here.

#### Priority Issues

**[P1] Bare `rounded` class contradicts the zero-radius rule**
- Why it matters: This is the one geometric rule that defines the whole system's identity (DESIGN.md's "Outline-Not-Shadow"/zero-radius doctrine); it's silently broken in 13 files.
- Fix: Strip `rounded` from daily-queue.tsx:86 and horizon-chart.tsx:17/38 (and the other 11 files — see Curriculum/Erreurs/Importer/Réglages/Onboarding/Focus reports for the full file list).
- Suggested command: `/impeccable harden`

**[P1] Text contrast fails WCAG AA on the periwinkle canvas**
- Why it matters: `text-secondary` (#675d52) directly on periwinkle (#CCCFFA) measures ~4.25:1, below the 4.5:1 body-text minimum — subject names and empty-state copy are hard to read for low-vision users.
- Fix: Wrap in a `bg-paper` island, or switch to the darker `ink-muted` token.
- Suggested command: `/impeccable audit`

**[P1] No bulk/keyboard reorder path**
- Why it matters: A backlog of 15-20 items (realistic with FSRS) means 15-20 individual full-page-submit clicks to move one item to the top.
- Fix: Add a "move to top" action or keyboard arrow-key reorder.
- Suggested command: `/impeccable optimize`

**[P2] "Session en cours" banner uses alarming amber/warning styling for a neutral resumable state**
- Why it matters: Sets an alarmed tone on the very first screen after login for something that isn't an error.
- Fix: Switch to `status="info"` (sky) or softer neutral copy.
- Suggested command: `/impeccable quieter`

**[P3] Raw ISO date shown in empty-state copy**
- Why it matters: "Prochaine échéance : 2026-07-18" reads as unfinished/debug output in an otherwise French UI.
- Fix: Format with `Intl.DateTimeFormat("fr-FR")`.
- Suggested command: `/impeccable polish`

#### Persona Red Flags

**Alex (Power User)**: No bulk reorder, no shortcuts — must click a ghost up/down button per row to move an item 10 slots; "Commencer" always full-navigates.

**Sam (Accessibility)**: The 4.25:1 contrast fail on subject names/empty-state text is a real screen-reader/low-vision blocker.

**Casey (Mobile)**: `size="lg"` icon-only buttons stacked vertically plus a Commencer/Reporter pair in the same flex-wrap row risk cramped 44px targets on narrow viewports; long subject names get hard `truncate` with no tooltip fallback for touch.

#### Minor Observations
- DailyQueue uses `Button isIconOnly` instead of Astryx's documented `IconButton` for icon-only actions — functionally fine, just not the documented idiom.
- `AttentionBadges` always uses the `warning` variant regardless of badge type, flattening genuinely different urgencies into one color.

#### Questions to Consider
- Should "en retard" (backlog debt) carry visual urgency (coral/warning) when >0, or is uniform neutral styling intentional to avoid alarming the user daily?
- Is the amber "Session en cours" banner deliberately warning-toned to discourage abandoning sessions, or an oversight?
- Was the `rounded` class a leftover from an earlier Card-based draft of these components, given DESIGN.md explicitly documents "no card-wrapped rows"?
