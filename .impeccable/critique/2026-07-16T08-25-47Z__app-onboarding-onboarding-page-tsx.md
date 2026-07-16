---
target: Onboarding
total_score: 24
p0_count: 0
p1_count: 2
timestamp: 2026-07-16T08-25-47Z
slug: app-onboarding-onboarding-page-tsx
---
Method: dual-agent (A: ae68f769747abfc29 · B: a9c9c10e04285cb3f)

#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | "Étape N/4" is tiny secondary-colored text, no visual step markers |
| 2 | Match System / Real World | 3 | Accurate, unpretentious domain vocabulary |
| 3 | User Control and Freedom | 1 | No visible "Précédent" (back) affordance anywhere |
| 4 | Consistency and Standards | 2 | `rounded` class contradicts DESIGN.md's zero-radius law |
| 5 | Error Prevention | 2 | Forward path well-guarded; silent redirect if 0 subjects |
| 6 | Recognition Rather Than Recall | 3 | Fields carry visible labels, slider shows current value |
| 7 | Flexibility and Efficiency | 3 | "Passer" skip links plus documented URL-driven resumability |
| 8 | Aesthetic and Minimalist Design | 3 | Spare and on-brand aside from the radius leak |
| 9 | Error Recovery | 3 | Inline errors rendered under every form |
| 10 | Help and Documentation | 2 | One good reassurance line on rhythm; no "change this later" pointer elsewhere |
| **Total** | | **24/40** | **Acceptable** |

#### Anti-Patterns Verdict

**LLM assessment**: No stock AI-slop patterns — subject list correctly renders as bordered rows, not cards. One real DESIGN.md violation: `rounded` at onboarding-steps.tsx:39 and :46, the same repo-wide pattern found elsewhere. The bigger issue is the opposite of slop: the screen is under-designed for a first-run moment — no step markers, no back button, no welcome framing.

**Deterministic scan**: Clean — 0 findings across both files.

**Visual overlays**: Not available — no browser automation tool exposed in this session.

#### Overall Impression

Functionally sound (resilient URL-driven state, good skip affordances with reassurance copy) but emotionally flat for what is a brand-new user's literal first interaction with the product. It reads as a config form, not an on-ramp, and ends on a bare data list rather than a confident close.

#### What's Working
- URL-driven step state gives genuinely resilient refresh/back-button behavior by construction — the server refetches from DB, no client state loss.
- Skip affordances on steps 2 and 3 explicitly reassure the user their choices are editable later, respecting autonomy without forcing decisions.

#### Priority Issues

**[P1] No in-UI back navigation on any step**
- Why it matters: Users can't correct an earlier answer without hunting for a back button that doesn't exist.
- Fix: Add a ghost "Précédent" button linking to `?step=N-1` beside each "Suivant".
- Suggested command: `/impeccable onboard`

**[P1] Zero-radius violation at onboarding-steps.tsx:39, 46**
- Why it matters: DESIGN.md treats square corners as the system's spine; these are the only two bordered containers on this screen and both break it.
- Fix: Drop the `rounded` class.
- Suggested command: `/impeccable polish`

**[P2] Silent redirect to step 1 when the user has 0 subjects and `step>1`**
- Why it matters: A user who deletes their only matière or hits a stale URL gets bounced with zero explanation.
- Fix: Pass a reason and render an inline notice ("Ajoutez d'abord une matière") on the redirected page.
- Suggested command: `/impeccable clarify`

**[P2] StepRecap ends onboarding on a bare data list, no motivating close**
- Why it matters: The first product interaction ends flat instead of confident — the worst possible spot for a peak-end failure.
- Fix: Add one welcoming line and a pointer to Réglages before "Terminer".
- Suggested command: `/impeccable delight`

**[P3] Step progress is unstyled, barely visible text with no lookahead**
- Why it matters: Under-designed for a first-run moment.
- Fix: Add a minimal 4-segment flat indicator (no radius) above the heading.
- Suggested command: `/impeccable onboard`

#### Persona Red Flags

**Jordan (First-Timer)**: Gets no welcome framing at all — lands straight into a form labeled "Vos matières" with a rule-breaking rounded card, and finishes on a flat list with no encouragement, the worst combination for a first product impression.

**Riley (Stress Tester)**: A direct URL to step=4 with zero subjects is correctly caught by the server guard, but silently — reads as a bug even though the logic is sound.

**Casey (Mobile)**: Two-button rows have no confirmed wrap handling at narrow widths — worth a manual check.

#### Minor Observations
- StepRecap's subject list join has no truncation — a student with 8+ matières gets one long unbroken line.
- No app identity/logo shown anywhere in the flow.

#### Questions to Consider
- Is a visible back button intentionally omitted to keep the flow strictly forward, or is that an oversight?
- Was the `rounded` class a copy-paste from a pre-DESIGN.md pass, or is a card treatment intentionally being reconsidered for onboarding specifically?
