---
target: Curriculum
total_score: 27
p0_count: 0
p1_count: 2
timestamp: 2026-07-16T08-25-47Z
slug: app-app-curriculum-page-tsx
---
Method: dual-agent (A: a793dbfcdb6e6a500 · B: a9871fcc6a112e61e)

#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | `a_trier` status shows a "warning" dot promising action, but no button exists for it |
| 2 | Match System / Real World | 4 | Accurate, consistent domain French |
| 3 | User Control and Freedom | 2 | `importee`/`a_trier`/`exclue` sections are dead ends on this screen |
| 4 | Consistency and Standards | 3 | Stray `rounded` class + Card-wrapped chapters are the exceptions |
| 5 | Error Prevention | 4 | StrongConfirmDialog retype-to-match, explicit archive-first nudge |
| 6 | Recognition Rather Than Recall | 3 | Chapters default collapsed, forcing recall of contents |
| 7 | Flexibility and Efficiency | 2 | No search/filter, no bulk actions, no "expand all" |
| 8 | Aesthetic and Minimalist Design | 2 | SectionRow packs up to 5 simultaneous chunks per row |
| 9 | Error Recovery | 3 | Coral badge + message on queue errors, no inline retry |
| 10 | Help and Documentation | 1 | No explanation of the 9 section statuses |
| **Total** | | **27/40** | **Good** |

#### Anti-Patterns Verdict

**LLM assessment**: Correctly avoids classic slop — sections render as genuine bordered rows via List/ListItem, matching DESIGN.md's row mandate. Two real deviations: a bare `rounded` class on RubricQueuePanel's wrapper (curriculum-ui.tsx:107), and chapters wrapped in nested Card-in-Card-in-list, borderline against the "dense data = rows, never Card-wrapped" rule.

**Deterministic scan**: Clean — `detect.mjs` found 0 findings across the 3 scanned files. The `rounded` and Card-nesting issues are structural/systemic patterns the current detector ruleset doesn't check for.

**Visual overlays**: Not available — no browser automation tool exposed in this session.

#### Overall Impression

The strongest screen of the seven — real row-based rendering, a well-built destructive-confirm flow with an archive-first nudge, and disciplined status-color use. The main gap is a UI promise the screen can't keep: several statuses render an actionable-looking warning dot with zero action attached.

#### What's Working
- Sections genuinely rendered as edge-to-edge rows per DESIGN.md, not slop cards.
- StrongConfirmDialog is a well-built, disabled-until-match destructive gate with an archive-first nudge in the copy.
- Status color vocabulary stays inside the committed 5-hue set throughout.

#### Priority Issues

**[P1] Bare `rounded` class on RubricQueuePanel wrapper (curriculum-ui.tsx:107)**
- Why it matters: Direct DESIGN.md violation, visibly inconsistent chrome next to zero-radius Cards below it.
- Fix: Drop `rounded`, use an Astryx layout primitive instead of a bare `<ul className=...>`.
- Suggested command: `/impeccable polish`

**[P1] `a_trier` status shows a warning dot with no available action**
- Why it matters: Users hit a colored "needs attention" signal with no way to act on it from this screen — a control/status-visibility mismatch that reads as broken to a first-timer.
- Fix: Either add the missing triage entry point or downgrade `a_trier`'s dot to neutral until that action exists.
- Suggested command: `/impeccable clarify`

**[P2] Chapters wrapped in nested Card instead of rows (curriculum-ui.tsx:509)**
- Why it matters: Contradicts the row-not-card rule for dense tree data, adds visual weight at the busiest level of the tree.
- Fix: Convert ChapterItem to a List/ListItem row consistent with SectionRow.
- Suggested command: `/impeccable layout`

**[P2] SectionRow duplicates the status label as separate dot + text**
- Why it matters: Pushes the row to 5 simultaneous elements, crossing the cognitive-load chunking guideline without adding new information.
- Fix: Drop the redundant `<Text>` and let StatusDot's own label carry it.
- Suggested command: `/impeccable distill`

**[P3] No search/filter across matières/chapitres/sections**
- Why it matters: A large curriculum (many subjects, 50+ sections) has no way to jump to a specific section besides scrolling and expanding.
- Fix: Add a lightweight filter input above the tree.
- Suggested command: `/impeccable optimize`

#### Persona Red Flags

**Alex (Power User)**: No bulk archive/delete, no "expand all," one rubric enqueue at a time; tedious at scale.

**Sam (Accessibility)**: Status is communicated via dot+text together (good), but the chevron/title toggle has no confirmed visible focus styling, and long titles have no truncation safeguard that could push focus outlines off-screen.

**Riley (Stress Tester)**: Long chapter/section titles have no `truncate`/ellipsis anywhere — will wrap unpredictably through flex-wrap HStacks rather than truncating cleanly.

#### Minor Observations
- "Aucune section" empty-chapter message sits crowded among badges in the collapsed header row, easy to miss.
- RubricQueuePanel's error text is the smallest text on the page for the most important message (a failure).

#### Questions to Consider
- Is the triage screen for `a_trier`/`importee` sections genuinely unbuilt, or does it exist elsewhere and just isn't linked from here?
- Was Card intentionally chosen for ChapterItem over List/ListItem because chapters need collapsible nested content, or is it an oversight relative to the row rule?
