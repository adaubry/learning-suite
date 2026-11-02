<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — Contrat de travail pour tout agent de code sur ce projet

> Fichier canonique et agnostique de l'outil. CLAUDE.md y renvoie et ajoute le protocole propre à Claude Code. En cas de divergence entre les deux, AGENTS.md prime.

## Le projet en une phrase

Webapp de révision du droit pour un étudiant (v2) : import de sets de fiches (Markdown exporté de Google Docs), sessions blurting → comparaison côte à côte avec la fiche et auto-évaluation → auto-note, carnet d'erreurs, et planification par répétition espacée (FSRS) — le Planificateur étant l'organe central. Aucun LLM.

## 1. Hiérarchie des sources de vérité

Les documents de `src/docs/` gouvernent le code, jamais l'inverse :

1. **FORMAT.md** — format des fiches (titre 2 = fiche, thèse, étiquettes en gras, tableaux)
2. **ARCHITECTURE.md** — cycle unique, planificateur, modèle de données, registre des invariants (§8)
3. **USER_FLOW.md** — écrans, états vides/erreur
4. **TECH_MAPPING.md** — délégations : natif > librairies listées > maison
5. **DECISIONS.md** — arbitrages en cours de route (journal v2 ; le journal v1 est dans l'historique git)

Specs de composants encore en vigueur : CHESS.md / CHESS2.md (puzzle distracteur), IMPLEMENT_SCHEDULE.md (écran Régularité).

**Règle absolue** : toute contradiction entre une demande, le code existant et un document doit être **signalée avant d'agir** — jamais résolue silencieusement. Si l'implémentation exige de dévier d'un document, la déviation se décide avec l'humain et se consigne (DECISIONS.md + version du document concerné).

## 2. Interdictions fermes (violations = travail rejeté)

1. **Aucune dépendance hors de TECH_MAPPING.** Une lib manquante se propose à l'humain, elle ne s'installe pas. Ne jamais réécrire ce qui est délégué (parseur Markdown, dialogues, FSRS) ni remplacer une délégation (remark, Astryx, ts-fsrs, zod).
2. **Aucune logique métier dans une Server Action.** Gabarit strict : auth → validation zod → appel d'UN service → retour. Tout dépassement descend dans `src/services/`.
3. **Aucun appel LLM.** L'humain a retiré la correction LLM (coût, lenteur) au profit de l'auto-évaluation ; réintroduire un LLM se décide avec lui. Le cas échéant : un seul point d'accès serveur, sorties validées par zod, prompts versionnés dans `/prompts` (voir l'historique git et PROMPTS_CHANGELOG.md).
4. **Ne jamais modifier un test tagué `@canary`** ni assouplir une assertion pour « faire passer » — un canari rouge invalide la modification, pas le test. Le déplacement/renommage d'un canari requiert une autorisation humaine explicite.
5. **Ne jamais réimplémenter un invariant.** Chaque invariant a UN propriétaire (ARCHITECTURE §8) : session unique ouverte, ≤ 2 blurtings, démarrage seulement par action explicite → SessionService ; note FSRS de l'utilisateur, gel des cartes → ReviewService ; historique FSRS conservé au ré-import → FicheService.
6. **Hors périmètre, refus par défaut** (ARCHITECTURE §10) : génération de fiches dans l'app, dialogue oral / Feynman, multi-utilisateur, mobile natif, import PDF. Le proposer = scope creep.

## 3. Architecture — rappels opposables

- **Quatre couches, dépendances à sens unique** : `components/ → server actions → services/ → core/ + db/`.
- `src/core/` est **pur** (aucune I/O) : parseur de fiches et points de contrôle (`core/fiche`), appariement au ré-import, verdict, planner, fsrs. Tests unitaires exhaustifs obligatoires.
- Le cycle de session est **codé en dur** ; le bilan des cases met un bouton en avant, l'utilisateur choisit.
- Le mode focus est un **layout de route** `(focus)/` : jamais de navigation rendue dans ces écrans ; `BlurtingEditor` ne reçoit jamais le contenu de la fiche en props.
- Les fiches ne s'éditent pas dans l'app : elles se modifient dans leur document source puis se ré-importent.

## 4. Conventions

- TypeScript strict ; unions discriminées pour les états ; pas de `any` non justifié.
- Vocabulaire du domaine en français dans les types et la DB (`fiche`, `tentative`, `blurting`…) — cohérent avec les documents ; code utilitaire en anglais si plus naturel.
- Un commit par tâche/fonctionnalité cohérente, préfixe conventionnel `type: message` (`feat`, `fix`, `docs`, `chore`, `refactor`), une ligne, à l'impératif. Pas d'outillage (commitlint/husky) — la convention se respecte, elle ne se fait pas policer par un hook.
- `npm run check` (typecheck + lint + tests) DOIT être vert avant de déclarer une tâche terminée ; `npm run test:canary` vert en permanence.

## 5. Definition of done d'une tâche

1. Fonctions implémentées **une par une**, chacune avec ses tests avant la suivante.
2. `npm run check` et `test:canary` verts ; nouveaux canaris posés si la tâche touche un invariant critique (ARCHITECTURE §8).
3. Aucun écran livré sans état vide.
4. Écarts, doutes et arbitrages listés explicitement à l'humain ; DECISIONS.md mis à jour si arbitrage.

## 6. En cas d'incertitude

S'arrêter. Exposer les options avec leurs conséquences en référant les documents (« ARCHITECTURE §7 dit X, la demande implique Y »). Ne jamais deviner une exigence produit : c'est le rôle de l'humain. Une question posée coûte une minute ; une hypothèse silencieuse coûte une phase.

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
