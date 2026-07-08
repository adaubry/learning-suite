# TECH_MAPPING.md — Délégation : natif Next.js d'abord, librairies spécialisées ensuite, code maison en dernier

> **Statut** : v0.3
> **Rôle** : pour chaque brique de FUNCTIONS.md, décide dans l'ordre de priorité imposé : **(1) natif Next.js / React / TypeScript / plateforme web → (2) librairie spécialisée → (3) code maison.** Le code maison est réservé à ce qu'aucune librairie ne peut savoir : le domaine.
> **Dépend de** : FUNCTIONS.md. **Répercuté dans** : ARCHITECTURE.md v0.3 (stack + modèle), USER_FLOW.md v0.3, FUNCTIONS.md v0.3.

---

## 0. Doctrine de délégation

1. **Natif d'abord** : App Router, Server Actions, layouts, Suspense/streaming, `error.tsx`/`loading.tsx`, `after()`, cache/revalidation, proxy (`proxy.ts`, anciennement `middleware.ts`) ; React 19 (`useActionState`, `useOptimistic`, `useFormStatus`) ; TypeScript (unions discriminées pour les machines à états) ; plateforme web (`crypto.subtle`, `Intl`, `MediaRecorder`, `speechSynthesis`, Web Speech API, **drag & drop HTML5**).
2. **Librairies spécialisées retenues** :
   - **Markdown** : `unified/remark` (AST `mdast` avec positions) — voir §0bis pour le choix face à MDX ;
   - **WYSIWYG façon Google Docs** : `Tiptap` (base ProseMirror) + sérialisation Markdown ;
   - **UI** : **`shadcn/ui` (Radix) exclusivement** — dialogues, toasts, formulaires, sidebar, Calendar, menus. Pas de lib de charts, pas de lib de drag & drop, pas de lib de calendrier tierces (§4.2) ;
   - `jsdiff` (diff textuel), `ts-fsrs` (SRS), `zod` (validation), `Tailwind` (imposé).
3. **Code maison = le domaine uniquement** : appariement de sections, composition de la file, divulgation contrôlée, services, prompts. C'est la valeur du projet ; tout le reste se délègue.

## 0bis. Pourquoi remark et pas MDX (`@next/mdx`) ?

MDX résout un autre problème. C'est un **compilateur de contenu en composants React** (Markdown + JSX, transformé au build) — fait pour des blogs et des docs qui vivent dans le repo. Nos chapitres sont des **données utilisateur dynamiques en base**, à parser à l'exécution pour en extraire arbre, positions et segments : de la manipulation programmatique d'AST, pas du rendu de contenu. Trois raisons rédhibitoires :

1. MDX compile au **build** ; nos cours arrivent au **runtime**.
2. MDX **exécute du JSX embarqué** dans le contenu — sur des données utilisateur, c'est une surface d'injection.
3. MDX utilise **remark en interne** : choisir remark, c'est prendre directement la couche utile, sans l'étage de compilation dont on ne se servirait pas.

---

## 1. Cœurs purs (P1–P10)

| Brique                      | 1. Natif                         | 2. Librairie                                                                                                       | 3. Reste maison                                                                               |
| --------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| **P1 parseChapter**         | —                                | **remark** : parsing entièrement délégué ; `mdast` fournit les positions exactes de chaque heading/strong/emphasis | Couche fine de règles : projection mdast → notre modèle, réversibilité via `remark-stringify` |
| **P2 validateDocument**     | —                                | positions fournies par l'AST                                                                                       | **Règles métier** (hiérarchie descendante, gras+italique) — aucune lib ne connaît FORMAT.md   |
| **P3 computeContentHash**   | **`crypto.subtle.digest` natif** | —                                                                                                                  | 5 lignes de normalisation                                                                     |
| **P4 matchSections**        | —                                | —                                                                                                                  | **100 % maison, assumé** — la logique de domaine critique, tests maximaux                     |
| **P5 diffChapterVersions**  | —                                | **jsdiff** pour le diff textuel                                                                                    | Alignement par titres au-dessus de jsdiff                                                     |
| **P6 mechanicalSectioning** | —                                | trivial sur l'AST remark                                                                                           | Cascade T2 → T1 → chapitre                                                                    |
| **P7 buildDailyQueue**      | TypeScript pur                   | —                                                                                                                  | **100 % maison** — la composition de la file EST le produit                                   |
| **P8 computeHorizon**       | —                                | —                                                                                                                  | Calcul maison (simple) ; rendu en barres Tailwind (§4.2)                                      |
| **P9 fsrsCore**             | —                                | **ts-fsrs** (algorithme + preview)                                                                                 | Wrapper mince                                                                                 |
| **P10 presentCorrection**   | —                                | —                                                                                                                  | **100 % maison** — règle pédagogique, pas problème technique                                  |

## 2. Appels LLM (L0–L6)

| Brique                 | 1. Natif                                                                   | 2. Librairie | 3. Reste maison                                                       |
| ---------------------- | -------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------- |
| **L0 callLLM**         | `fetch` natif (OpenRouter = POST JSON) ; streaming via `ReadableStream`    | `zod`        | Retry avec réinjection d'erreur de schéma, PromptLog, ContextBuilders |
| **L1–L5**              | —                                                                          | —            | **Prompts et ContextBuilders : le cœur maison, non délégable**        |
| **L6 transcribeAudio** | **`MediaRecorder` natif** (capture) ; **Web Speech API native** (fallback) | —            | Appel du modèle audio OpenRouter + destruction de l'audio             |

## 3. Services (S1–S9) & Server Actions

| Brique         | 1. Natif                                                                                        | 2. Librairie                                                                                | 3. Reste maison                                   |
| -------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Server Actions | **natives** + `useActionState`/`useFormStatus` ; `revalidatePath`/`revalidateTag`               | schémas `zod` partagés client/serveur                                                       | Rien (adaptateurs minces)                         |
| Auth           | **proxy natif** (`proxy.ts`, protection des routes)                                              | Supabase Auth                                                                               | —                                                 |
| S1–S9          | transactions Drizzle ; `after()` pour les effets non bloquants (audit, déclenchement paresseux) | Drizzle                                                                                     | **Toute la logique de domaine — c'est le projet** |
| Tâches de fond | **Route Handlers natifs** frappés par un cron                                                   | **Vercel Cron** ou `pg_cron` (Next.js n'a pas de scheduler interne — limite native assumée) | Logique des tâches                                |

## 4. UI (U1–U24)

### 4.1 Coquilles & primitives

| Brique                          | 1. Natif                                                                                                                                                                                                        | 2. Librairie                                                                  | 3. Reste maison                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- |
| **U1 AppShell / U2 FocusShell** | **Layouts + route groups natifs** : `(app)/layout.tsx` porte la sidebar, `(focus)/layout.tsx` porte le mode focus — le sanctuaire est un **layout de route**, la navigation ne peut pas s'afficher par accident | sidebar shadcn                                                                | Indicateur « session en cours »             |
| **U9 EmptyState/ErrorState**    | **`error.tsx`, `loading.tsx`, `not-found.tsx` natifs** par segment                                                                                                                                              | habillage shadcn                                                              | Messages didactiques + voies de secours LLM |
| **U8 ConfirmDialog / toasts**   | —                                                                                                                                                                                                               | **shadcn** (Dialog, AlertDialog, Toast — Radix)                               | Contenus (nom à retaper, archivage d'abord) |
| **U3 MarkdownViewer**           | —                                                                                                                                                                                                               | rendu depuis l'AST remark, composants custom pour les 2 constructions stylées | Styles                                      |
| **U4 CourseEditor (WYSIWYG)**   | —                                                                                                                                                                                                               | **Tiptap façon Google Docs** — §5                                             | Extensions de validation + mapping FORMAT   |
| **U5 AnomalyPanel**             | —                                                                                                                                                                                                               | positions remark/Tiptap                                                       | Rendu + scroll-to                           |
| **U6 DiffViewer**               | —                                                                                                                                                                                                               | jsdiff + rendu maison léger                                                   | Surlignage « sera écrasé »                  |
| **U7 ConsequencesDialog**       | —                                                                                                                                                                                                               | shadcn Dialog                                                                 | Bilan de simulation (domaine)               |

### 4.2 Planning — **tout shadcn, zéro lib tierce supplémentaire**

| Brique                                         | 1. Natif                                                                                                                                                                                                                      | 2. Librairie                                                                                                                                 | 3. Reste maison                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **U10 DailyQueue — réordonnancement**          | **v1 : boutons/poignées de réordonnancement** (accessible, mobile-friendly) ; **amélioration progressive : drag & drop HTML5 natif** (attributs `draggable`, événements standards — conforme à la doctrine « natif d'abord ») | composants shadcn (Card, DropdownMenu, Button)                                                                                               | Persistance de l'ordre (S5.reorder), cartes de domaine |
| **U11 HorizonChart**                           | **Barres pures Tailwind/CSS** : un graphe de charge par jour = des divs à hauteurs proportionnelles, stylées shadcn — zéro dépendance                                                                                         | (option future : shadcn Charts, en sachant qu'ils **encapsulent Recharts** en dépendance transitive — assumé et documenté si un jour activé) | Mise en forme des données (P8)                         |
| **Vue calendrier des échéances** (option v1.1) | —                                                                                                                                                                                                                             | **shadcn Calendar** (vue mois, jours à échéances marqués)                                                                                    | Adaptateur données                                     |
| **U18 FsrsRatingBar**                          | —                                                                                                                                                                                                                             | boutons shadcn                                                                                                                               | Preview d'intervalles (P9)                             |

### 4.3 Domaine (peu délégable, par nature)

| Brique                                       | Délégation                                                                                                  | Reste maison                                     |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **U13 TriageList**                           | shadcn (inline edit, menus)                                                                                  | logique fusion/scission                          |
| **U14, U16, U17, U21, U24**                  | primitives shadcn (formulaires, badges, accordéons)                                                         | **tout le contenu — ces écrans SONT le produit** |
| **U15 BlurtingEditor**                       | `<textarea>` autogrow ou Tiptap minimal (gras seul)                                                         | garantie « aucun accès au cours » (composition)  |
| **U19 FeynmanChat / U20 PushToTalkRecorder** | **MediaRecorder natif** ; Suspense/streaming pour les relances ; **`speechSynthesis` natif** pour le TTS v1 | orchestration + transcript éditable              |
| **U22 CurriculumTree / U23 ImportWizard**    | routes natives, **`searchParams` pour l'étape du wizard** (reprise gratuite par URL)                        | contenu                                          |

---

## 5. Décision structurante : édition WYSIWYG (Tiptap), Markdown = stockage/échange

1. **Tiptap configuré avec EXACTEMENT nos trois constructions** : Heading 1–3, Bold, Italic — rien d'autre. **La barre d'outils EST la convention FORMAT.md** ; un document invalide par emphase devient impossible à saisir (le gras+italique interdit à la frappe par extension). Seule la hiérarchie des titres reste à valider (P2).
2. **Le Markdown change de rôle sans disparaître** : stockage (`Chapter.markdown`, sur lequel P3/P5 continuent d'opérer) et échange (import Google Docs). Sérialisation bidirectionnelle Tiptap ↔ Markdown, fiable précisément parce que le vocabulaire se limite à trois constructions.
3. **É6.2 s'aligne sur Google Docs** : mêmes gestes (Ctrl+B, menus de titres) ; la prévisualisation devient inutile, le WYSIWYG EST la vue.
4. **Vigilance** : tests de **round-trip** (doc → éditeur → doc, identique au hash près) exigés dès l'installation — LE risque de cette délégation, faible avec trois constructions, non nul.

## 6. Stack consolidée (reprise dans ARCHITECTURE v0.3)

| Couche                           | Choix                                                                      | Statut       |
| -------------------------------- | -------------------------------------------------------------------------- | ------------ |
| Framework                        | Next.js App Router + TypeScript + Tailwind                                 | imposé       |
| Auth / BDD / ORM                 | Supabase + Drizzle                                                         | acté         |
| Parsing Markdown                 | **unified/remark** (jamais MDX — §0bis)                                    | acté         |
| Éditeur de cours                 | **Tiptap** (Heading 1–3, Bold, Italic uniquement) + sérialisation Markdown | acté         |
| UI                               | **shadcn/ui (Radix) exclusivement** + Tailwind                             | acté         |
| Réordonnancement file            | boutons shadcn v1 → **drag & drop HTML5 natif**                            | acté         |
| Graphes horizon                  | **barres Tailwind pures** (zéro lib)                                       | acté         |
| Calendrier échéances (option)    | shadcn Calendar                                                            | v1.1         |
| Diff                             | **jsdiff** + alignement par titres maison                                  | acté         |
| LLM                              | OpenRouter via `fetch` natif + zod                                         | acté (ADR 9) |
| Audio / TTS                      | MediaRecorder + speechSynthesis + Web Speech API (natifs)                  | acté         |
| SRS                              | ts-fsrs                                                                    | acté         |
| Hash                             | `crypto.subtle` natif                                                      | acté         |
| Erreurs/chargement/layouts/focus | mécanismes natifs App Router                                               | doctrine     |
| Formulaires                      | Server Actions + `useActionState` + zod partagé                            | doctrine     |
| Tâches de fond                   | Route Handlers + Vercel Cron (ou pg_cron) + `after()`                      | doctrine     |

## 7. Ce qui reste maison — la carte du territoire

**Domaine pur (irremplaçable)** : P4 appariement, P7 file du jour, P10 divulgation, règles FORMAT sur l'AST (P2), alignement de diff par titres, services S1–S9, prompts + ContextBuilders, contenu des écrans de domaine. Tout le reste est délégué. Si une session de vibecoding propose d'écrire ce qu'une ligne de ce document délègue (un parseur Markdown, une lib de charts, un dialogue modal) **ou d'introduire une lib que ce document ne liste pas**, c'est un refus par défaut — la lib se discute ici d'abord.

## Journal des versions

| Version | Date       | Changement                                                                                                                                                                                                                                                                       |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.3     | 2026-07-08 | U13 TriageList : retrait de « réordonnancement comme U10 » — ce document de délégation technique n'a pas vocation à créer une exigence produit ; ni FUNCTIONS §6.2 ni USER_FLOW É1.4 ne décrivent de réordonnancement manuel du tri, l'ordre suit celui des bornes du plan (DECISIONS.md, bloc 3.3). |
| 0.1     | 2026-07-02 | Création (remark, Tiptap, dnd-kit, Recharts, FullCalendar)                                                                                                                                                                                                                       |
| 0.2     | 2026-07-02 | §0bis remark vs MDX ; **UI 100 % shadcn** : dnd-kit remplacé par boutons shadcn + drag & drop HTML5 natif, Recharts remplacé par barres Tailwind pures (note transitive honnête sur shadcn Charts), FullCalendar remplacé par shadcn Calendar ; règle anti-lib non listée en §7. |
