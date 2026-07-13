@AGENTS.md

# CLAUDE.md — Protocole Claude Code pour ce projet

> **AGENTS.md est le contrat canonique : le lire intégralement et s'y conformer. En cas de divergence, AGENTS.md prime.** Ce fichier ajoute uniquement le protocole de session propre à Claude Code.

## 1. Protocole de session — travail par tâche (post-plan)

**PLAN.md est clos** (Phase 9 terminée, Phase 10 volontairement abandonnée — voir DECISIONS.md et l'en-tête de PLAN.md). L'app est en usage quotidien réel : il n'y a plus de « bloc » ni de session pré-découpée par le plan. Chaque session traite la tâche donnée par l'humain, à sa taille propre — pas de récitation formelle obligatoire, pas de règle « une session = un bloc ».

Ce qui reste non négociable :

- **Avant de coder** : si la tâche touche un service/invariant déjà arbitré, lire DECISIONS.md et signaler toute décision existante qui contraint ou contredit la demande. En cas d'exigence ambiguë ou de contradiction entre documents, signaler et attendre (§2) plutôt que deviner.
- Implémenter **fonction par fonction** quand la tâche s'y prête : une fonction → ses tests → vert → la suivante.
- Terminer par : `npm run check` + `npm run test:canary` (+ `npm run evals` si un prompt a bougé), puis un récapitulatif : ce qui est fait, ce qui dévie (et pourquoi), ce qui reste, ce que l'humain doit tester au navigateur si pertinent.
- **Un commit par tâche cohérente**, format d'AGENTS.md §4. Ne pas committer un état rouge.

## 2. Réflexes spécifiques attendus

- **Le doute interrompt.** Une exigence ambiguë, une contradiction entre documents, un test existant qui gêne : signaler et attendre. Ne jamais « interpréter » une règle produit, ne jamais contourner un canari.
- **Anti-scope-creep actif** : ne pas proposer de fonctionnalités, d'abstractions « pour plus tard », de généralisations multi-utilisateurs, ni de refactors non demandés. Le périmètre est celui de la tâche demandée, point.
- **Prompts = code critique** : toute modification d'un fichier de `/prompts` exige nouvelle version du fichier (`.vN+1.md`), entrée PROMPTS_CHANGELOG.md, passage des evals, et verdict consigné.
- **Vérifier avant d'affirmer** : ne jamais prétendre qu'un test passe sans l'avoir exécuté ; ne jamais décrire un comportement du code sans l'avoir lu dans cette session.
- **Données réelles** : les fixtures de parsing/correction proviennent de `e2e/evals/` et des vrais cours de l'utilisateur — ne pas inventer de faux cours de droit pour les tests d'intégration (les exemples juridiques hallucinés sont précisément ce qu'on chasse).

## 3. Commandes du projet

| Commande                           | Rôle                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run dev`                      | serveur de développement                                                                       |
| `npm run check`                    | typecheck + lint + tests — le verdict d'une tâche                                              |
| `npm run test:canary`              | canaris déterministes Vitest + Playwright (suffixe `.canary.`, LLM mocké) — vert en permanence |
| `npm run check:full`               | check + suite Playwright complète — avant une mise en production                               |
| `npm run evals`                    | jeu d'or des prompts — après toute modification de prompt                                      |
| `npm run db:migrate` / `db:studio` | migrations Drizzle / inspection                                                                |

## 4. Carte du dépôt

```
src/docs/      FORMAT, ARCHITECTURE, USER_FLOW, FUNCTIONS, TECH_MAPPING ← sources de vérité
               DECISIONS.md, PROMPTS_CHANGELOG.md   ← toujours actifs
               PLAN.md ← clos (historique de construction, ne gouverne plus les sessions)
prompts/       *.vN.md — versionnés, jamais inline
e2e/           tout ce qui touche aux tests e2e/ia, un seul dossier :
                 *.spec.ts / *.canary.spec.ts  — specs Playwright (navigateur)
                 evals/                        — jeu d'or + canaris LLM (vraie API)
                 test-results/, playwright-report/ — artefacts générés, ignorés
proxy.ts       protection des routes (ex-middleware.ts, Next 16) — redirige vers
               /login si pas de session, sauf /login et /auth/callback
app/(auth)/    login (magic link) + server actions signIn/signOut
app/auth/callback/  échange le code magic link contre une session
app/(app)/     écrans avec navigation
app/(focus)/   écrans sanctuarisés (blurting, feynman, révision) — pas de nav
src/core/      cœurs purs P1–P10 — tests exhaustifs
src/services/  domaine S1–S9 — propriétaires des invariants (FUNCTIONS §7)
src/lib/supabase/  clients Supabase (browser/server) + helper de proxy
src/db/        Drizzle : schéma + migrations (supabase/ = stack local, `supabase start`)
src/llm/       L0 unique point d'accès OpenRouter + ContextBuilders + schemas
src/components/ U1–U24 — shadcn uniquement
```

<!-- ASTRYX:START -->
Astryx v0.1.4 · 149 components
CLI: run every command as `npx astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in your app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — discover, don't guess. Before writing UI:
1. `astryx build "<idea>"` — START HERE: returns a kit (closest [page] + [block]s + [component]s). No args = full playbook.
2. `astryx template <name> [--skeleton]` — scaffold the [page]/[block]s it named, or study their layout. Templates are reference code.
3. `astryx component <Name>` — props + examples for every component you use.

RULES:
- No <div> — components do all layout/spacing. Full page → AppShell; sidebar nav → SideNav.
- Frame first: pick the shell (AppShell / Layout+LayoutPanel) and budget regions in px BEFORE writing content (`astryx docs layout`).
- Dense data = rows (Table, List/Item) edge-to-edge — never Card-wrapped list items. Card = dashboard widgets, galleries, settings groups only.
- Status → StatusDot/Token; Badge only for counts and enumerated states, never decoration.
- Custom styling: component props first; else Tailwind utilities backed by tokens (bg-surface, text-primary, rounded-lg) via tailwind-theme.css. No raw hex/px.
- Tokens for every value (`astryx docs tokens`). Brand/accent via `astryx theme` — never override --color-* in :root.

MORE CLI:
  search "<query>"   find any component / hook / doc / template / block
  component --list   149 components by category
  template --list    page + block recipes
  docs <topic>       color, elevation, icons, illustrations, layout, migration, motion, principles, shape, spacing, styling, theme, tokens, typography
  swizzle <Name>     eject component source for deep customization
  upgrade --apply    run after any @astryxdesign/core bump
<!-- ASTRYX:END -->
