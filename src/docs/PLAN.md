# PLAN.md — Plan de construction du MVP (un ingénieur + Claude Code)

> **Statut** : v0.2
> **Rôle** : plan de bataille phase par phase, du repo vide au MVP utilisé quotidiennement. Chaque phase = des **blocs de fonctions** (références P/S/L/U de FUNCTIONS.md v0.3) livrés fonction par fonction, avec tests automatisés, **canaris anti-hallucination**, test navigateur, correction, puis critères de sortie. On ne passe JAMAIS à la phase suivante avec un critère de sortie non rempli.
> **Dépend de** : tous les documents de conception (FORMAT v0.2, ARCHITECTURE v0.3, USER_FLOW v0.3, FUNCTIONS v0.3, TECH_MAPPING v0.2).

---

## 0. La méthode de travail — la boucle par bloc

Chaque **bloc** suit exactement cette boucle avec Claude Code :

1. **Cadrage (toi)** : ouvrir une session par bloc (jamais deux blocs dans une session). Donner l'ordre en référant les IDs (« implémente P1 selon FUNCTIONS §1 et FORMAT §2, fichiers sous src/core/parser/ »).
2. **Récitation (canari de compréhension)** : exiger AVANT tout code que Claude Code (a) cite les sections de documents qui gouvernent le bloc, (b) liste les fichiers qu'il va créer/modifier, (c) liste ce qu'il n'a PAS le droit de faire (libs hors TECH_MAPPING, logique dans les Server Actions, invariants d'autrui). **S'il récite faux ou invente une exigence : stop, corriger le cadrage, recommencer.** C'est le détecteur d'hallucination le moins cher qui existe.
3. **Implémentation fonction par fonction** : une fonction → ses tests → vert → la suivante. Jamais « tout le bloc puis les tests ».
4. **Canaris de régression** : la suite complète de tests (dont les canaris marqués `@canary`, intouchables sans ta permission explicite) doit être verte. Un canari rouge = la modification est rejetée, pas le canari.
5. **Test navigateur (toi)** : dérouler le scénario manuel du bloc sur `npm run dev`. Noter les écarts.
6. **Correction** : nouvelle passe Claude Code sur les écarts uniquement, même boucle.
7. **Commit** : un commit par bloc, message référant les IDs. Mettre à jour DECISIONS.md si un arbitrage a eu lieu.

**Règles permanentes de session** (à mettre dans CLAUDE.md, Phase 0) : interdiction d'ajouter une dépendance absente de TECH_MAPPING §6 ; interdiction de modifier un test `@canary` ; interdiction de logique métier dans une Server Action ; toute contradiction avec un document de conception doit être signalée, jamais résolue silencieusement ; les prompts LLM vivent dans `/prompts`, jamais inline.

---

## Phase 0 — Fondations & harnais de test

**Objectif** : un squelette qui démarre, s'authentifie, se teste — le harnais avant la machine.

- **Bloc 0.1 — Bootstrap** : Next.js (App Router, TS strict) + Tailwind + shadcn/ui init ; structure `src/core|services|llm|db|components` + `app/(app)` et `app/(focus)` (les deux layouts de route — le mode focus existe dès le premier jour) ; `prompts/`, `evals/`, `docs/` (y copier les 5 documents de conception + CLAUDE.md + DECISIONS.md vide).
- **Bloc 0.2 — Harnais.** Deux exécuteurs, trois familles de tests, quatre commandes — le fonctionnement exact :

  **Les deux exécuteurs.**
  - **Vitest** : tout ce qui s'exécute sans navigateur — cœurs purs (`src/core/`), services (contre une base de test), ContextBuilders, schémas zod. Les appels LLM y sont **toujours mockés** (réponses fixes enregistrées) : ces tests sont déterministes, gratuits et rapides.
  - **Playwright** : les parcours navigateur (login, import, cycle d'étude…), contre `npm run dev` + base de test seedée. LLM mocké au niveau réseau (interception de la route vers L0) pour rester déterministe.

  **Les trois familles.**
  1. **Tests ordinaires** (Vitest + Playwright) : la couverture normale de chaque bloc.
  2. **Canaris déterministes** : sous-ensemble sentinelle intouchable, identifié par **convention de nommage** — `*.canary.test.ts` (Vitest) et `*.canary.spec.ts` (Playwright). Le suffixe de fichier plutôt qu'un tag : le filtrage est natif chez les deux exécuteurs, impossible à oublier, et la revue de code voit immédiatement qu'on touche à un canari. LLM toujours mocké ici aussi — un canari doit pouvoir tourner en boucle sans coût ni flakiness.
  3. **Canaris LLM (evals)** : les seuls tests qui frappent le **vrai** OpenRouter (`evals/`, jeu d'or sur données réelles). Volontairement HORS de `test:canary` : ils coûtent de l'argent et dépendent d'un service externe — ils se lancent sur modification de prompt ou de modèle, pas à chaque commit.

  **Les quatre commandes.**
  | Commande | Contenu | Quand |
  |---|---|---|
  | `npm run check` | typecheck (`tsc --noEmit`) + lint + **Vitest complet** | en continu, à chaque fonction terminée — le verdict rapide, sans navigateur |
  | `npm run test:canary` | **agrège les deux exécuteurs** : `vitest run` sur `*.canary.test.ts` PUIS `playwright test` sur `*.canary.spec.ts` — échec de l'un = échec du tout | avant chaque commit ; vert en permanence |
  | `npm run check:full` | `check` + suite Playwright complète | fin de bloc, avant le test navigateur manuel |
  | `npm run evals` | canaris LLM contre la vraie API, rapport de score | après toute modification de `/prompts` ou de `llm/models.ts` |

  Donc oui : **`test:canary` allie Vitest et Playwright** — c'est un agrégateur séquentiel des deux exécuteurs filtrés sur le suffixe `.canary.` — mais il n'inclut **jamais** les canaris LLM, qui vivent dans `evals` avec leur propre cycle de déclenchement.

- **Bloc 0.3 — Supabase + Drizzle + Auth** : connexion, migration vide, middleware natif de protection des routes, pages login/logout (P0 É0.1).

**Canaris** : un test Playwright `@canary` « l'app démarre et /login s'affiche » ; un test « une route protégée redirige vers /login ».
**Navigateur** : créer un compte, se connecter, se déconnecter.
**Sortie** : `npm run check` vert ; auth fonctionnelle ; CLAUDE.md en place et récité correctement par une session d'essai.

## Phase 1 — Modèle de données & curriculum minimal

**Objectif** : créer matières et chapitres vides, naviguer l'arbre. Premier vrai CRUD de bout en bout.

- **Bloc 1.1 — Schéma Drizzle complet** (ARCHITECTURE §8) : TOUTES les tables d'un coup (même celles utilisées plus tard) — le schéma est la colonne vertébrale, on ne le découvre pas par morceaux. Contraintes en base des invariants (§7 FUNCTIONS) incluses — en particulier l'index unique partiel `StudyCycle(user_id) WHERE closed_at IS NULL` (session unique ouverte) et l'unicité `ReviewCard(section_id)`.
- **Bloc 1.2 — S9 partiel + U22 minimal** : CRUD matières (nom, semestre, date d'examen), fiche matière, arbre curriculum vide, onboarding É0.2 (config rythme + méthodologie globale).

**Canaris** : test d'intégrité « le schéma migré correspond aux entités d'ARCHITECTURE §8 » (liste de tables/colonnes attendues) ; unicité ReviewCard/section ; contrainte « pas d'étude sans rubrique valide » présente ; `@canary` « deux INSERT de StudyCycle ouverts pour le même user ⇒ le second échoue ».
**Navigateur** : onboarding complet, création de 2 matières avec dates d'examen, navigation.
**Sortie** : parcours P0 entier fonctionnel.

## Phase 2 — Le parseur & l'import (le pipeline commence)

**Objectif** : importer un vrai chapitre de tes cours et voir son rapport de validation. **Première confrontation avec tes données réelles — ne pas utiliser de fixtures inventées seulement.**

- **Bloc 2.1 — P1 + P2 + P3** (cœurs purs sur AST remark) : projection mdast → modèle, extraction gras/commentaires, réversibilité, règles de validation, hash normalisé. Fixtures : 3 vrais exports Google Docs de tes cours + les exemples valides/invalides de FORMAT §7.
- **Bloc 2.2 — S1.import + U23 (étapes É1.0–É1.2) + U3 + U5** : wizard (étape dans searchParams), upload/collage, rapport d'anomalies cliquable, acquittement, création du Chapter v1.

**Canaris** : `@canary` round-trip parseur « contenu + italiques réinjectés ≡ source » sur les 3 vrais chapitres ; `@canary` « hiérarchie orpheline détectée » ; `@canary` « deux exports identiques ⇒ même hash ».
**Navigateur** : importer un vrai chapitre de droit civil, vérifier surlignages gras/commentaires, acquitter, valider.
**Sortie** : un chapitre réel en base, rapport fidèle, aucune anomalie fantôme.

## Phase 3 — Infrastructure LLM & sectionnement

**Objectif** : le premier appel IA de bout en bout, encadré dès le départ.

- **Bloc 3.1 — L0 (le socle)** : client fetch OpenRouter, chargement des prompts versionnés, ContextBuilders (purs, testés), validation Zod, retry avec réinjection d'erreur, PromptLog, `llm/models.ts`. **Aucun autre bloc LLM ne commence tant que L0 n'est pas béton.**
- **Bloc 3.2 — L1 + P6 + prompt sectionnement.v1** : appel, vérification des bornes côté code, fallback mécanique en cascade.
- **Bloc 3.3 — S2 + U13 (É1.3–É1.4)** : écran de sectionnement (streaming si simple, sinon spinner v1), tri complet (importance 1..5, renommage, fusion/scission avec filiation).

**Canaris** : `@canary` ContextBuilder L1 « n'envoie ni plus ni moins que le contrat ARCHITECTURE §9 » (assertion sur les clés du contexte) ; `@canary` « bornes incohérentes ⇒ rejet + retry » (LLM mocké) ; `@canary` P6 sur chapitre sans Titre 2. Premier **eval réel** : `evals/sectionnement/` = tes 3 chapitres + le découpage que TOI tu juges idéal ; script de comparaison lancé à chaque changement de prompt.
**Navigateur** : sectionner le chapitre importé, trier réellement (dont une fusion et une exclusion importance 1), couper OpenRouter (clé invalide) et vérifier la voie de secours P6.
**Sortie** : sections `active`/`exclue` en base ; le sectionnement te satisfait sur tes 3 chapitres (sinon : itérer le prompt AVANT de continuer — c'est maintenant que c'est pas cher).

## Phase 4 — Rubriques

**Objectif** : générer, éditer, valider la rubrique d'une section — le garde-fou central.

- **Bloc 4.1 — L2 + prompt rubrique.v1 + S3 (generate/validate/regenerate/generateBatch)** : la génération paresseuse (lazyScheduler) attendra la Phase 6 (elle dépend du Planificateur) — en attendant, bouton manuel « générer la rubrique » sur la section.
- **Bloc 4.2 — U14 (É1.5)** : édition complète des points, section en vis-à-vis, validation → `prete`.

**Canaris** : `@canary` « chaque segment gras couvert par ≥ 1 point » (validation post-LLM côté code) ; `@canary` « rubrique sans point critique ⇒ rejet+retry » ; `@canary` contrainte DB « étude impossible sans rubrique valide ». Eval : `evals/rubriques/` = 3 rubriques que tu as validées/corrigées = référence.
**Navigateur** : générer sur 3 sections réelles, corriger ce qui te déplaît (compter tes éditions — c'est ta métrique de qualité du prompt), valider.
**Sortie** : 3 sections `prete` ; tes éditions par rubrique tendent vers ~faible après itération du prompt.

## Phase 5 — Le cycle d'étude (le cœur du produit)

**Objectif** : blurting → correction → carnet d'erreurs, en conditions réelles. **La phase la plus longue et la plus importante : c'est ici que tu commences à utiliser l'app pour de vrai, tous les jours.**

- **Bloc 5.1 — S4 (start/submit/resolve) + P10 + L3 + prompt correction_erreurs.v1** : entrée temporaire par le curriculum (« étudier maintenant » sur une section `prete`) — le Planificateur n'existe pas encore. Sauvegarde avant LLM, session unique, immuabilité, divulgation côté serveur.
- **Bloc 5.2 — U15 + U16 + U17 (É3.1–É3.2)** : blurting plein écran dans le layout `(focus)`, correction à divulgation contrôlée, issues (retenter plus tard*, révéler, Feynman placeholder), erreurs candidates. *« Retenter plus tard » pose un RefileItem même si la file n'existe pas encore — la donnée précède l'écran.
- **Bloc 5.3 — S7 + S8 + U24 (É5.1)** : commit des candidates (règles complètes, récidive par id), carnet filtré, AuditService et ses événements.

**Canaris — les plus importants du projet** (`evals/correction/`, constitués de TES vrais blurtings dès la première semaine d'usage) : `@canary` **blurting parfait ⇒ zéro erreur** (anti-hallucination de fautes) ; `@canary` **confusion juridique grossière ⇒ détectée en critique** ; `@canary` **reformulation valide ⇒ non pénalisée** ; `@canary` P10 « verdict insuffisant en étude ⇒ les contenus attendus ne sont PAS dans la réponse réseau » (test au niveau HTTP, pas du rendu) ; `@canary` « le client ne reçoit jamais le contenu du chapitre sur l'écran blurting ».
**Navigateur** : cycle réel sur une section que tu dois vraiment apprendre ; vérifier dans l'onglet réseau que rien ne fuite ; tenter un retry immédiat (doit être impossible) ; laisser des candidates sans statuer et vérifier l'auto-acceptation.
**Sortie** : tu as étudié ≥ 3 sections réelles via l'app ; le correcteur te paraît juste (sinon : itérer correction_erreurs.v1 contre les evals — priorité absolue) ; les 5 canaris verts.

## Phase 6 — Le Planificateur & la révision (l'app devient quotidienne)

**Objectif** : la page d'accueil devient la file du jour ; FSRS entre en jeu ; la boucle complète étude → validation → révision se ferme.

- **Bloc 6.1 — P7 + P8 (purs, tests exhaustifs)** : composition de la file (tous les cas limites d'ARCHITECTURE §3), horizon.
- **Bloc 6.2 — P9 + S6** : wrapper ts-fsrs, createCard (branchée sur S4.validateSection — validation sans Feynman autorisée temporairement pour toutes les importances, restriction rétablie en Phase 7), rate, freeze/unfreeze, preview.
- **Bloc 6.3 — S5 + U10 + U11 + U12 (É2.0)** : file du jour (réordonnancement boutons shadcn, reporter avec règles slot-perdu/dette, re-file intra-journée), horizon en barres Tailwind, badges d'attention, remplacement de l'entrée temporaire de la Phase 5.
- **Bloc 6.4 — Révision (É4.1–É4.2) + S3.lazyScheduler + tâches de fond** : blurting de rappel (réutilise U15/U16), U18 avec previews, Again→re-file, 2×Again→prete ; cron (Vercel Cron ou pg_cron) : génération paresseuse, expiration de la re-file, purge de l'ordre manuel.

**Canaris** : `@canary` P7 sur les cas limites (file vide, tout en retard, plafond 0, examen passé, re-file en queue) ; `@canary` « la note FSRS vient de l'utilisateur, jamais du verdict » (assertion d'API) ; `@canary` « Again ⇒ RefileItem du jour ; 2ᵉ Again ⇒ section prete » ; `@canary` gel/dégel idempotents.
**Navigateur** : vivre 3 jours réels avec l'app — matin : file du jour ; étudier, valider, voir la carte créée ; forcer une révision (due manipulée en base) et la noter ; reporter ; vérifier la re-file après un Again.
**Sortie** : tu utilises l'accueil comme point d'entrée unique pendant 3 jours sans contournement ; les échéances FSRS te semblent sensées.

## Phase 7 — Feynman (la brique risquée, isolée exprès)

**Objectif** : le dialogue oral. La vigilance ADR 9 se lève ici.

- **Bloc 7.0 — SPIKE transcription (½ journée max)** : prototype jetable — MediaRecorder → modèle audio via OpenRouter → transcript FR avec vocabulaire juridique. **Décision GO/FALLBACK** (Web Speech API) consignée dans DECISIONS.md avant d'écrire la moindre ligne du vrai code.
- **Bloc 7.1 — L6 + U20** : push-to-talk, transcript éditable, destruction de l'audio, bascule clavier, glossaire de section dans le contexte.
- **Bloc 7.2 — L4 + L5 + prompts feynman.v1 + U19 + U21 (É3.3–É3.4)** : tours streamés, clôture, bilan ancré rubrique, TTS `speechSynthesis`, règle « Feynman requis si importance ≥ 3 » rétablie dans S4.

**Canaris** : `@canary` « l'audio n'existe plus en stockage après confirmation du transcript » ; `@canary` bilan « verdict acquis ⇒ tous les points critiques marqués démontrés » (cohérence interne du schéma) ; eval `evals/feynman/` : 2 transcripts de dialogues réels + le bilan que tu juges correct.
**Navigateur** : un Feynman complet à voix haute sur une vraie section, dont un tour corrigé à la main ; vérifier que le questionneur creuse tes erreurs actives ; clore, valider.
**Sortie** : cycle d'étude COMPLET (blurting → Feynman → validée → planifiée) sur une section réelle.

## Phase 8 — Versionnage, ré-import & éditeur WYSIWYG (la brique dangereuse, en dernier des grosses)

**Objectif** : la cascade d'invalidation — abordée maintenant que le système qu'elle invalide existe et est compris.

- **Bloc 8.1 — P4 (matchSections)** : pur, AVANT toute UI, avec la plus grosse suite de tests du projet (renommages, déplacements, scissions implicites, contenus proches — construis les cas depuis de vraies évolutions de tes cours). Seuil conservateur vérifié par les tests.
- **Bloc 8.2 — P5 + S1.simulateUpdate/commitUpdate + U6 + U7** : diff aligné par titres, pipeline simulation→conséquences→commit (transactionnel), badges post-cascade.
- **Bloc 8.3 — U4 Tiptap (É6.2)** : WYSIWYG 3 constructions, gras+italique bloqué à la frappe, **tests de round-trip Tiptap↔Markdown `@canary` posés avant l'intégration à l'écran** (TECH_MAPPING §5), bandeau « reporter dans le Google Doc ».
- **Bloc 8.4 — É6.3 ré-import** : le parcours complet sur une vraie mise à jour d'un de tes cours.

**Canaris** : `@canary` P4 « section au contenu identique ⇒ toujours intacte » ; `@canary` « en cas de doute ⇒ disparue+nouvelle, jamais mal appariée » (cas construits) ; `@canary` « StudySessions et ErrorEntries antérieures inchangées après cascade » (comparaison avant/après en base) ; `@canary` round-trip Tiptap sur tes 3 chapitres réels (hash égal).
**Navigateur** : modifier réellement un cours dans Google Docs après un TD, ré-importer, lire le diff, vérifier le bilan de conséquences, committer, re-valider la rubrique invalidée, constater que l'historique d'étude a survécu.
**Sortie** : un ré-import réel sans aucune perte d'historique.

## Phase 9 — Cycle de vie & finitions MVP

**Objectif** : tout ce qui rend l'app vivable à l'année.

- **Bloc 9.1** : archivage matière/chapitre (S1/S6), suggestion à examen+7j, suppression gardée, export JSON (S9), réglages P7.
- **Bloc 9.2** : reprise de session (S4.resume + indicateur U1), états vides/erreur de TOUS les écrans passés en revue contre USER_FLOW (chaque écran doit avoir les siens — règle transversale 7), messages d'erreur LLM avec voies de secours vérifiés un par un (débrancher OpenRouter et parcourir l'app).
- **Bloc 9.3** : passe accessibilité/mobile (l'app sera utilisée sur téléphone dans le train), performance (pas de N+1 sur la file), seeds de démo.

**Canaris** : `@canary` « archiver puis désarchiver ⇒ échéances recalculées, historique intact » ; `@canary` export JSON re-parsable complet.
**Navigateur** : simuler une fin de semestre complète ; utiliser l'app 15 minutes sur téléphone.
**Sortie** : zéro écran sans état vide/erreur ; l'app survit à OpenRouter coupé partout.

## Phase 10 — Durcissement des prompts & mise en service réelle

**Objectif** : le MVP devient TON outil de travail ; la qualité IA passe sous contrôle statistique.

- **Bloc 10.1 — Consolidation des evals** : `evals/` atteint ≥ 15 blurtings réels annotés, ≥ 5 rubriques de référence, 2 dialogues Feynman, tes 3 sectionnements ; script `npm run evals` avec rapport de score ; PROMPTS_CHANGELOG.md discipliné (toute modif de prompt ⇒ evals ⇒ verdict consigné).
- **Bloc 10.2 — Campagne d'itération des prompts** : une session par prompt, contre les evals, jusqu'à tes seuils (ex. : zéro erreur hallucinée sur le canari « blurting parfait », 100 % des confusions grossières attrapées).
- **Bloc 10.3 — Mise en service** : import de l'intégralité de ton S2 (ou du semestre en cours), tri complet, et bascule : l'app devient ton outil quotidien. Revue hebdomadaire : AuditEvents (tes overrides révèlent les faiblesses du correcteur), PromptLog (coûts), DeferralLog (réalisme du rythme).

**Sortie du plan** : deux semaines d'utilisation quotidienne réelle sans retour à l'ancienne méthode. C'est la seule définition de « fini » qui compte.

---

## Vue d'ensemble des dépendances

```
0 Fondations → 1 Schéma/Curriculum → 2 Parseur/Import → 3 L0+Sectionnement → 4 Rubriques
    → 5 Cycle d'étude (cœur, début d'usage réel) → 6 Planificateur+Révision (usage quotidien)
    → 7 Feynman (risque isolé, spike d'abord) → 8 Versionnage/WYSIWYG (danger isolé, en dernier)
    → 9 Cycle de vie/finitions → 10 Prompts sous contrôle + mise en service
```

Deux inversions délibérées par rapport à l'ordre « naturel » : le **Planificateur avant Feynman** (l'usage quotidien crée les vraies données d'eval dont Feynman et les prompts ont besoin) et le **versionnage en Phase 8** (P4 est la brique la plus dangereuse : on l'aborde quand le système qu'elle peut casser existe, est testé, et qu'on le comprend intimement).

## Journal des versions

| Version | Date       | Changement                                                                                                                                                                                                                                                                                                 |
| ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | 2026-07-02 | Création — 11 phases, boucle par bloc avec canaris de compréhension et de régression                                                                                                                                                                                                                       |
| 0.2     | 2026-07-02 | Bloc 0.2 détaillé suite à review : mécanique exacte du harnais — deux exécuteurs (Vitest/Playwright), trois familles (ordinaires, canaris déterministes par suffixe `.canary.`, canaris LLM dans evals), quatre commandes ; `test:canary` = agrégateur des deux exécuteurs, LLM toujours mocké hors evals. |
