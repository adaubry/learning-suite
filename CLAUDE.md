@AGENTS.md

# CLAUDE.md — Protocole Claude Code pour ce projet

> **AGENTS.md est le contrat canonique : le lire intégralement et s'y conformer. En cas de divergence, AGENTS.md prime.** Ce fichier ajoute uniquement le protocole de session propre à Claude Code.

## 1. Protocole de session — la boucle par bloc (PLAN.md §0)

**Une session = un bloc du PLAN.** Jamais deux blocs, jamais un bloc entamé « en passant ».

### Étape 0 obligatoire — la récitation (canari de compréhension)

Avant TOUTE ligne de code, produire et attendre validation humaine de :

1. **Gouvernance** : les sections exactes des documents qui régissent le bloc (ex. « Bloc 5.1 : FUNCTIONS §3-S4, ARCHITECTURE §5 machine B + ADR 2/11, USER_FLOW É3.1–É3.2 »), avec citation des règles qui contraignent l'implémentation. Lire DECISIONS.md avant de commencer : signaler toute décision existante qui contraint ou contredit le bloc.
2. **Plan de fichiers** : liste exhaustive des fichiers à créer/modifier.
3. **Interdits applicables** : ce que ce bloc pourrait tenter et n'a pas le droit de faire (libs hors liste, logique en Server Action, invariant d'un autre service, contenu masqué envoyé au client…).
4. **Canaris** : ceux du bloc à poser (PLAN.md) et ceux existants susceptibles d'être impactés.

Si la récitation est corrigée par l'humain : la refaire. On ne code pas sur une compréhension rafistolée oralement.

### Ensuite

- Implémenter **fonction par fonction** : une fonction → ses tests → vert → la suivante. Jamais « tout le bloc puis les tests ».
- Terminer par : `npm run check` + `npm run test:canary` (+ `npm run evals` si un prompt a bougé), puis un récapitulatif : ce qui est fait, ce qui dévie (et pourquoi), ce qui reste, ce que l'humain doit tester au navigateur (scénario du bloc dans PLAN.md).
- **Un commit par bloc**, format d'AGENTS.md §4. Ne pas committer un état rouge.

## 2. Réflexes spécifiques attendus

- **Le doute interrompt.** Une exigence ambiguë, une contradiction entre documents, un test existant qui gêne : signaler et attendre. Ne jamais « interpréter » une règle produit, ne jamais contourner un canari.
- **Anti-scope-creep actif** : ne pas proposer de fonctionnalités, d'abstractions « pour plus tard », de généralisations multi-utilisateurs, ni de refactors non demandés. Le périmètre est celui du bloc courant, point.
- **Prompts = code critique** : toute modification d'un fichier de `/prompts` exige nouvelle version du fichier (`.vN+1.md`), entrée PROMPTS_CHANGELOG.md, passage des evals, et verdict consigné.
- **Vérifier avant d'affirmer** : ne jamais prétendre qu'un test passe sans l'avoir exécuté ; ne jamais décrire un comportement du code sans l'avoir lu dans cette session.
- **Données réelles** : les fixtures de parsing/correction proviennent de `e2e/evals/` et des vrais cours de l'utilisateur — ne pas inventer de faux cours de droit pour les tests d'intégration (les exemples juridiques hallucinés sont précisément ce qu'on chasse).

## 3. Commandes du projet

| Commande                           | Rôle                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run dev`                      | serveur de développement                                                                       |
| `npm run check`                    | typecheck + lint + tests — le verdict d'un bloc                                                |
| `npm run test:canary`              | canaris déterministes Vitest + Playwright (suffixe `.canary.`, LLM mocké) — vert en permanence |
| `npm run check:full`               | check + suite Playwright complète — fin de bloc                                                |
| `npm run evals`                    | jeu d'or des prompts — après toute modification de prompt                                      |
| `npm run db:migrate` / `db:studio` | migrations Drizzle / inspection                                                                |

## 4. Carte du dépôt

```
src/docs/      FORMAT, ARCHITECTURE, USER_FLOW, FUNCTIONS, TECH_MAPPING, PLAN,
               DECISIONS.md, PROMPTS_CHANGELOG.md   ← sources de vérité
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
