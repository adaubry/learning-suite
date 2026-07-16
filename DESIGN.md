---
name: Learning Suite
description: Daily study console for a law student's blurting → Feynman → spaced-review cycle, skinned in Y2K periwinkle-and-charcoal chrome.
colors:
  ink: "#2d241b"
  ink-secondary: "#675d52"
  ink-faded: "#d1c5b8"
  ink-muted: "#4f453b"
  periwinkle: "#CCCFFA"
  paper: "#FFFFFF"
  cream: "#ede0d4"
  outline: "#2F292E"
  lime: "#C5E17A"
  lime-hover: "#B5D16A"
  lime-ink: "#3a5500"
  coral: "#FFC5C3"
  coral-ink: "#8b1d24"
  amber: "#FFE08A"
  amber-ink: "#614400"
  sky: "#B8E0FF"
  sky-ink: "#004e74"
typography:
  display:
    fontFamily: "Crimson Text, Georgia, Times New Roman, Times, serif"
    fontSize: "3.8125rem"
    fontWeight: 400
    lineHeight: 1.2459
  headline:
    fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.9375rem"
    fontWeight: 600
    lineHeight: 1.4194
  title:
    fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.5
  code:
    fontFamily: "JetBrains Mono, SF Mono, Monaco, Consolas, monospace"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  none: "0px"
  full: "9999px"
spacing:
  sm: "6px"
  md: "12px"
  lg: "18px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.periwinkle}"
    rounded: "{rounded.none}"
    padding: "0 18px"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.lime-ink}"
    rounded: "{rounded.none}"
    padding: "0 18px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.lime-hover}"
  button-destructive:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.coral-ink}"
    rounded: "{rounded.none}"
    padding: "0 18px"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  badge-pill:
    backgroundColor: "{colors.sky}"
    textColor: "{colors.sky-ink}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "18px"
  field-input:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.none}"
---

# Design System: Learning Suite

## 1. Overview

**Creative North Star: "The Periwinkle Terminal"**

The system reads as early-2000s desktop chrome pressed into service for a serious daily workflow: a saturated periwinkle canvas (`#CCCFFA`) holds white "paper" panels, every panel and control outlined in a near-black 1px line instead of a shadow, every corner pinned square. It's bubbly-pop by palette (lime greens, coral pinks, sky blues borrowed from the theme's ten-hue Y2K set) but brutalist by geometry — nothing here is soft, floating, or rounded except one deliberate exception (badge pills). The two forces sit in tension on purpose: candy colors, hard edges.

This is not a written brand brief translated into pixels — no PRODUCT.md exists yet for this project — so the rejections below are read off the code itself, not quoted from a strategy doc. What the shipped screens visibly avoid: no gradients anywhere, no glassmorphism, no drop-shadow "lifted card" affordance, no rounded corners outside the badge exception, and no card-wrapped list rows (curriculum sections and the daily queue both render as flat bordered `<li>` rows, per the Astryx house rule that dense data is rows, not nested cards).

**Key Characteristics:**
- Zero-radius brutalist chrome on every surface except pill-shaped badges
- Heavy 1px charcoal (`#2F292E`) outlines standing in for elevation — this system doesn't float things, it outlines them
- A periwinkle body canvas cradling white content islands, the single most identity-carrying color choice in the system
- One Poppins geometric sans carries the entire interface; a second serif (Crimson Text) is defined for oversized display text but unused by any screen so far
- A third, unrelated serif (EB Garamond) is layered on top of the Astryx theme entirely for long-form course reading — outside the theme's own type system

## 2. Colors

Committed color strategy: a single periwinkle wash carries the whole canvas, one charcoal ink does all the acting, and five hand-picked categorical hues (of the ten the Y2K theme ships) carry status.

### Primary
- **Ink** (`#2d241b`): primary button fill, every heading and body text color, primary icons — the theme's own `--color-accent` role is wired to this same value, so there is no separate "brand color" competing with it. In dark mode it flips via `light-dark()` to `#EDEFFC`, a near-white periwinkle-tinted ink.

### Secondary
- **Lime** (`#C5E17A` background / `#3a5500` text): secondary button fill+border+text, success badges, banners, and status dots. Hover darkens to **Lime Hover** (`#B5D16A`).

### Tertiary
- **Coral** (`#FFC5C3` background / `#8b1d24` text): destructive button fill+border+text (the "Supprimer définitivement" flow), error badges and banners.

### Neutral
- **Periwinkle** (`#CCCFFA`): the page canvas (`--color-background-body`) — the one color that makes this unmistakably Y2K rather than a generic light theme.
- **Paper** (`#FFFFFF`): every content surface sits on this — sidebar, cards, popovers, dialogs.
- **Cream** (`#ede0d4`): muted backgrounds and the neutral badge/status-dot fill.
- **Ink Secondary** (`#675d52`): secondary/supporting text, muted labels.
- **Ink Faded** (`#d1c5b8`): disabled text and icons, skeleton-loading fill.
- **Ink Muted** (`#4f453b`): the neutral-badge text/icon color, one shade darker than Ink Secondary.
- **Outline** (`#2F292E`): the near-black 1px border drawn on every button, field, and card edge — closer to true black than a typical hairline, doing the job a shadow does elsewhere.
- **Sky** (`#B8E0FF` background / `#004e74` text): the one "info" categorical accent actually wired into the app — exam-deadline warnings, informational badges.
- **Amber** (`#FFE08A` background / `#614400` text): warning badges and banners — sections awaiting a rubric, an open session banner, imminent exam deadlines.

### Named Rules
**The Five-of-Ten Rule.** The Y2K theme ships ten categorical hues (blue, cyan, gray, green, orange, pink, purple, red, teal, yellow); this app draws on five (green, red, yellow, blue, gray/cream). Pink, purple, cyan, orange, and teal are defined in the theme package but appear nowhere in the shipped code. Don't reach for one without a reason — five is the committed vocabulary.

**The Ink-Does-Everything Rule.** One dark neutral carries primary text, primary buttons, primary icons, and the theme's accent role simultaneously. There is no separate "brand blue" fighting it for attention.

## 3. Typography

**Display Font:** Crimson Text (with Georgia, "Times New Roman", Times, serif)
**Body Font:** Poppins (with -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif)
**Label/Mono Font:** JetBrains Mono (with "SF Mono", Monaco, Consolas, monospace) — declared by the theme, not actually loaded (see Named Rules)

**Character:** Poppins' rounded geometric letterforms carry the entire interface, headings through body, with weight alone doing the differentiation. Crimson Text is reserved for the theme's oversized display sizes — a deliberate contrast pairing between candy-geometric sans and classical serif — that so far shows up on no shipped screen.

### Hierarchy
- **Display 1/2/3** (400, 3.8125rem / 3.0625rem / 2.4375rem, leading ~1.23–1.25): Crimson Text serif, theme-level hero sizes; not yet used by any screen in this app.
- **Headline** (600, 1.9375rem down to 1.25rem across h1–h3, leading 1.4–1.44): Poppins, drives every heading.
- **Title** (600, 1rem–0.625rem across h4–h6, leading 1.5–1.6): Poppins, section and card-level headings.
- **Body** (400, 1rem, leading 1.5): Poppins, the default paragraph and most UI copy. Cap prose at 65–75ch where it runs long-form.
- **Supporting** (400, 12px, leading 1.5385): Poppins, the smallest UI text — metadata tags like "imp. 3" in the daily queue, timestamps.
- **Label** (500, 1rem, leading 1.5): Poppins, form field labels.
- **Code** (400, 1rem, leading 1.5): declared as JetBrains Mono by the theme; in practice renders in the fallback stack (see Named Rules).

### Named Rules
**The Unloaded Font Rule.** The Y2K theme's `--font-family-code` names "JetBrains Mono" by literal string, but `app/layout.tsx` only loads Poppins, Crimson Text, Geist Mono, and EB Garamond via `next/font`. Any `<code>`/`<pre>` styled purely through the theme (not through Tailwind's `font-mono` utility) silently falls back to SF Mono/Monaco/Consolas — JetBrains Mono never actually renders.

**The Second Serif Rule.** EB Garamond is loaded and mapped to Tailwind's `font-serif` utility, entirely outside the Astryx theme's own type system — reserved for read-only display of imported course text (`LectureView`, the chapter read view). Don't use it for interface chrome; it exists for exactly one job.

## 4. Elevation

The system is flat-with-outlines by default: buttons, fields, and cards carry a 1px near-black border (`--color-border: #2F292E`) instead of a shadow, and radius is pinned to `0px` everywhere the theme controls it. Shadow tokens (`--shadow-low/med/high`) exist and are wired into the underlying Astryx core for dialogs, popovers, and focus rings — but the theme's own first-party components (button, badge, banner, field, card) never reach for them. Depth reads as "outlined cut-out resting on a periwinkle table," not "floating card."

### Shadow Vocabulary
- **Low** (`0 2px 4px #2d241b0D, 0 4px 8px #2d241b1A`): reserved by the theme, not currently drawn on by any first-party component.
- **Med** (`0 2px 4px #2d241b0D, 0 4px 12px #2d241b1A`): dialogs and popovers at rest (Astryx core default).
- **High** (`0 4px 6px #2d241b1A, 0 12px 24px #2d241b26`): the top of the stack — open dialogs, dropdowns.

### Named Rules
**The Outline-Not-Shadow Rule.** Cards, buttons, and fields signal "distinct surface" with a 1px `#2F292E` border, not elevation. Don't add `box-shadow` to a card or button to make it feel lifted — reach for the border instead.

## 5. Components

### Buttons
- **Shape:** sharp corners, `0px` radius, always; 1px border in every variant.
- **Primary:** charcoal fill (`#2d241b`), periwinkle text (`#CCCFFA`) — the loudest surface in the system, reserved for the single primary action per view ("Commencer", "Reprendre la session").
- **Secondary:** lime fill (`#C5E17A`), lime-ink text and border (`#3a5500`); darkens to `#B5D16A` on hover.
- **Destructive:** coral fill (`#FFC5C3`), coral-ink text and border (`#8b1d24`) — the "Supprimer définitivement" confirm action.
- **Ghost:** border and fill both drop to transparent — de-emphasized actions (sign-out, up/down reorder arrows, "Reporter").

### Badges
- **Style:** pill-shaped (`9999px` radius) — the single exception to the zero-radius rule in the whole system — with a 1.5px border at 30% currentColor opacity.
- **Variants:** info (sky), success (lime), warning (amber), error (coral), neutral (cream/ink-muted). Status dots reuse the same five-hue vocabulary as filled circles instead of pills, plus a sixth "accent" (ink-colored) dot for states that are neither positive nor negative (e.g. a section currently in revision).

### Inputs / Fields
- **Style:** `0px` radius, border inherited from the shared outline token; no distinctive per-field treatment beyond that shared styling across text input, text area, date input, and file input.

### Rows (dense lists)
- **Style:** edge-to-edge, no card wrapper, no radius. The curriculum section list and the daily queue both render as flat bordered `<li>` rows rather than Card components — matching the Astryx house rule that dense data is rows, never nested cards.

### Navigation
- **Style:** permanent left rail (`AppShell` + `SideNav`). The selected nav item drops the pill background otherwise used for selection state and relies on text weight/color alone, with a neutral overlay tint on hover and a slightly stronger one on press.

## 6. Do's and Don'ts

### Do:
- **Do** keep every card, button, and field at `0px` radius — the sharp-corner look is the system's spine, set deliberately (`radius: {base: 4, multiplier: 0}` in the theme source), not a default left unset.
- **Do** use the 1px `#2F292E` outline as the way a surface separates from its background, in place of shadow.
- **Do** render dense lists (curriculum sections, daily queue) as edge-to-edge bordered rows, never Card-wrapped list items.
- **Do** stay within the five committed categorical hues (green/red/yellow/blue/gray) for status color — badges, banners, and status dots already share this vocabulary consistently.
- **Do** reserve EB Garamond strictly for read-only course text; nothing else in the interface chrome.

### Don't:
- **Don't** add `box-shadow` to a card or button to fake elevation — not this system's grammar; use the border.
- **Don't** round any corner beyond the badge-pill exception (`9999px`) — every other radius token in the theme is pinned to `0px` on purpose.
- **Don't** introduce pink, purple, cyan, orange, or teal without a reason — they're defined in the Y2K theme's palette but unused anywhere in the shipped app; pulling one in silently expands the committed color vocabulary.
- **Don't** style `<code>`/`<pre>` through the theme's own `--font-family-code` and expect JetBrains Mono to render — it isn't loaded; use the `font-mono` Tailwind utility (Geist Mono) instead.
- **Don't** reach for the Crimson Text display sizes casually — they're defined in the theme but unused by any screen; introducing them is a real design decision, not a free pull from the token sheet.
