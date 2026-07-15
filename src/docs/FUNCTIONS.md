# FUNCTIONS.md — Cahier des charges fonctionnel & UI

> **Statut** : v0.6
> **Rôle** : recense toutes les briques du projet — cœurs purs, services de domaine, appels LLM, actions serveur, composants UI — avec pour chacune objectif, fonctionnement abstrait et règles. Aucun code.
> **Dépend de** : FORMAT.md v0.2 · ARCHITECTURE.md v0.2 (+ annexe A de USER_FLOW) · USER_FLOW.md v0.2.
> **Nouveauté v0.2** : refonte en couches après auto-critique (§0) + module UI complet (§6). La v0.1 mélangeait logique métier et actions serveur, et dupliquait des mécaniques ; la table de correspondance v0.1→v0.2 est en annexe B.

---

## 0. Auto-critique de la v0.1 et principes de refonte

### Ce qui n'allait pas

1. **Logique métier logée dans les Server Actions.** F31, F33, F43… décrivaient des règles de domaine (divulgation, re-file, récidive) à l'intérieur d'actions serveur. Conséquence inévitable : dupliquer ces règles quand un deuxième point d'entrée en a besoin — c'est déjà arrivé dans le document même (étude vs révision).
2. **Duplication structurelle non assumée.** F5 (ré-import) et F7 (éditeur intégré) décrivaient DEUX fois le même pipeline simulation → dialogue de conséquences → commit → cascade. F31 et F41 décrivaient DEUX fois le pipeline de blurting. Un bug corrigé dans l'un aurait survécu dans l'autre.
3. **Invariants sans propriétaire unique.** « Une seule session ouverte », « rubrique valide requise », « gel des ReviewCards » étaient évoqués dans 3–4 fiches chacun. Un invariant énoncé à plusieurs endroits finit par diverger : il lui faut UN propriétaire.
4. **La journalisation des overrides éparpillée** (« journalisé » apparaissait dans six fiches, sans définition commune).
5. **Aucune couche UI**, alors que le user flow montre des écrans qui partagent massivement des composants (le blurting et sa correction apparaissent deux fois, l'éditeur Markdown validé trois fois…).

### Principes de la refonte

- **Quatre couches, dépendances à sens unique** :
  `UI (composants) → Server Actions (adaptateurs minces) → Services (domaine) → Cœurs purs + llm/ + db/`
- **Server Actions = adaptateurs minces** : authentification, validation d'entrée, appel d'UN service, retour. **Zéro logique métier.** Elles ne sont plus listées individuellement : chaque service expose ses points d'entrée, l'action serveur est un passe-plat d'une dizaine de lignes.
- **Un invariant = un propriétaire.** Chaque règle du système est la propriété d'exactement un service (tableau §7). Les autres l'invoquent, jamais ne la réimplémentent. Doublée d'une contrainte en base quand c'est possible.
- **Les cœurs purs restent purs** (parser, planner, FSRS, appariement, diff, présentation) — ce sont les seuls modules à tests unitaires exhaustifs obligatoires ; les services s'appuient sur eux et se testent par quelques tests d'intégration ciblés.
- **L'UI est un jeu de ~18 composants réutilisables** ; les écrans du user flow sont des _assemblages_, pas des implémentations (matrice §6.3).

---

## 1. Cœurs purs (`src/*/`) — calcul sans I/O, tests exhaustifs

| #   | Fonction                       | Objectif & fonctionnement (abstrait)                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **parseChapter**               | Markdown → arbre de titres + segments gras (en place) + commentaires italiques (extraits avec ancrage, hors source de vérité) + anomalies. Déterministe, réversible (contenu + italiques réinjectés ≡ source), ne corrige jamais : toute construction suspecte devient une anomalie.                                                                                                                                                                    |
| P2  | **validateDocument**           | Arbre P1 → anomalies typées et localisées (hiérarchie non descendante, gras+italique, Markdown mal formé), chacune acquittable. Batterie de règles indépendantes, extensible.                                                                                                                                                                                                                                                                           |
| P3  | **computeContentHash**         | Markdown → empreinte stable après normalisation légère (fins de ligne, espaces) pour éviter les faux positifs d'export Google Docs. Fondement du versionnage.                                                                                                                                                                                                                                                                                           |
| P4  | **matchSections**              | Ancien plan (sections + bornes + contenu) × nouvel arbre → table d'appariement {intacte, modifiée, disparue} + contenus nouveaux. Passes successives : hash de contenu, titre exact, similarité titre+position. Seuil **conservateur** : en cas de doute, « disparue + nouvelle » (re-tri, agacement léger) plutôt que mauvais appariement (historique pollué en silence). **La fonction la plus dangereuse du projet — couverture de tests maximale.** |
| P5  | **diffChapterVersions**        | Deux Markdown → segments ajoutés/supprimés/modifiés, alignés par titres pour l'affichage côte à côte (le diff ne dérive pas sur tout le document après une insertion). Sert É6.3 et l'historique É6.1.                                                                                                                                                                                                                                                  |
| P6  | **mechanicalSectioning**       | Secours sans LLM : une section par Titre 2, sinon par Titre 1, sinon chapitre entier. L'app n'est jamais bloquée par un appel LLM.                                                                                                                                                                                                                                                                                                                      |
| P7  | **buildDailyQueue**            | Compose la file du jour : révisions dues (retard, importance, proximité d'examen) → nouvelles études plafonnées (importance, examen, ordre curriculum) → re-file intra-journée en queue ; applique ensuite l'ordre manuel (drag & drop roi) ; calcule les indicateurs d'écart sans bloquer. Cas limites testés : file vide, tout en retard, plafond 0, examens passés.                                                                                  |
| P8  | **computeHorizon**             | ReviewCards → charge de révision 7/30 j (étiquetée ainsi — le backlog d'études sans dates n'y figure pas), dette, répartition par matière, échéances d'examens superposées.                                                                                                                                                                                                                                                                             |
| P9  | **fsrsCore** (wrapper ts-fsrs) | Note (Again/Hard/Good/Easy) × état de carte → nouvel état + échéance. Inclut **previewIntervals** : simulation des quatre notes sans effet de bord (affichage sous les boutons, É3.5 depuis la fusion Machine B/C 2026-07-15 — anciennement É4.2).                                                                                                                                                                                                                                                                  |
| —   | ~~P10 presentCorrection~~ | **Supprimée** (REVAMP.md v0.3, 2026-07-15) : divulgation contrôlée abandonnée en étude, plus aucun appelant avec masquage à opérer (révision n'en a jamais eu besoin) — la fonction ne faisait plus que recopier ses entrées telles quelles. `computeVerdict` (le calcul du verdict qu'elle hébergeait) déplacé dans `core/correction/verdict.ts`, réutilisé tel quel. |

## 2. Appels LLM (`llm/`) — catalogue contractualisé

| #   | Appel                                                 | Contrat (contexte → sortie validée)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L0  | **callLLM** (générique)                               | Unique point d'accès à OpenRouter. Charge le prompt versionné (`prompts/`), assemble le contexte via le **ContextBuilder** de l'appel (fonction pure par appel, testable : elle garantit qu'on n'envoie ni plus ni moins que le contrat ARCHITECTURE §9), résout le modèle (mapping configurable `llm/models.ts`), appelle, **valide Zod systématiquement**, retry avec réinjection de l'erreur de schéma (≤ N), journalise dans PromptLog. Clé API strictement serveur. Aucun autre module n'appelle OpenRouter — contrainte de revue. |
| L1  | **proposeSectioning**                                 | Plan + contenu intégral (italiques retirés) + méthodologie des titres (surcharge matière sinon globale) → sections {titre labelisé, bornes, justification}. Bornes vérifiées côté code (chevauchement/trou/dépassement ⇒ échec de validation ⇒ retry). Chapitre trop grand ⇒ traitement par Titres 1 avec continuité. Échec final ⇒ P6 proposé.                                                                                                                                                                                         |
| L2  | **generateGuide**                                     | Contenu de section + segments gras + commentaires + erreurs actives de la matière (plafonnées) → points de contrôle {critique/important/secondaire, intitulé, attendu, piège?}. Chaque gras couvert par ≥ 1 point ; rubrique sans point critique rejetée (retry avec consigne).                                                                                                                                                                                                                                                         |
| L3  | **correctBlurting** (correction + erreurs fusionnées) | Rubrique + texte soumis + erreurs actives de la section + n° tentative — **jamais le cours** → diff par point de contrôle + verdict proposé + erreurs candidates {type, description, id d'erreur existante si récidive}.                                                                                                                                                                                                                                                                                                                |
| L4  | **feynmanTurn**                                       | Rubrique + contenu de la section + historique des tours + erreurs actives (section & matière) + dernier transcript → relance socratique (texte libre, streaming). Rôle : questionner, jamais expliquer à la place ; cibler erreurs actives et critiques non démontrés.                                                                                                                                                                                                                                                                  |
| L5  | **feynmanReport**                                     | Historique complet → bilan ancré rubrique : par point de contrôle {démontré avec explication / récité / non abordé} + points solides + lacunes + verdict (acquis = tous les critiques démontrés).                                                                                                                                                                                                                                                                                                                                       |
| L6  | **transcribeAudio**                                   | Audio + glossaire de section (titres + gras, aide au vocabulaire juridique) → transcript brut, édité par l'utilisateur avant envoi. Modèle à entrée audio via OpenRouter (vigilance ADR 9, fallback Web Speech API). Audio détruit sitôt le transcript confirmé.                                                                                                                                                                                                                                                                        |

## 3. Services de domaine (`src/services/`) — logique métier, frontières transactionnelles

### S1 · ChapterService — cycle de vie du cours

- **Possède** : versionnage, cascade d'invalidation, doctrine de source de vérité.
- **Points d'entrée** : `import` (création v1, É1.2 ; refuse anomalies non acquittées, journalise les acquittements, déclenche S2), `simulateUpdate` / `commitUpdate` (pipeline **unique** partagé par le ré-import É6.3 et l'éditeur intégré É6.2 — deux portes, un chemin : parse P1 → hash P3 → diff P5 → appariement P4 → bilan de conséquences ; commit uniquement sur confirmation, en transaction : version++, rubriques obsolètes, sections archivées/nouvelles, sessions et erreurs passées intouchées), `archive`/`unarchive`, `delete` (confirmation forte, archivage proposé d'abord).
- **Invariants possédés** : jamais de commit sans simulation ; hash identique ⇒ no-op ; sessions/erreurs passées immuables.

### S2 · SectioningService — du chapitre aux cibles

- **Points d'entrée** : `propose` (L1, streaming, secours P6), `applyTriage` (É1.4 : importances, renommages, fusions/scissions avec filiation `parent_ids`, bornes recalculées ; rejouable en préservant l'historique des sections intouchées), `setImportance` (à tout moment : passage à 1 ⇒ exclusion + gel via S6 ; retour ≥ 2 ⇒ réintégration, rien de détruit).

### S3 · GuideService — rubriques

- **Points d'entrée** : `generate` (L2), `validate` (relecture humaine → `valide`, section `prete` — le garde-fou ADR 5), `regenerate` (l'ancienne passe `obsolete`), `lazyScheduler` (tâche de fond + hook de S5 : génère à l'approche de la tête de file, jamais d'avance pour l'importance 2), `generateBatch` (option manuelle du chapitre).
- **Invariants possédés** : une seule rubrique non-obsolète par section ; **aucune étude sans rubrique `valide`** (doublé d'une contrainte en base).

### S4 · SessionService — sessions d'étude et de révision

- **Possède** : le pipeline de blurting **unique** (étude ET révision — types différents, même chemin), l'immuabilité, la divulgation.
- **Points d'entrée** : `start` (vérifie rubrique via S3, crée ou reprend — **une seule session ouverte par utilisateur**, invariant possédé ici et nulle part ailleurs ; **tout cycle démarre en `lecture`** depuis la fusion Machine B/C, 2026-07-15 — `type` etude/revision n'est plus qu'un label), `terminerLecture` (REVAMP v2, 2026-07-15 : transition seule `lecture → blurting`, appelée depuis la lecture initiale ET la relecture ciblée), `submitBlurting` (sauvegarde AVANT tout appel — un blurting n'est jamais perdu — puis L3, attache correction+verdict ; divulgation toujours complète, plus de filtrage P10 ; cap à 2 tentatives, sans distinction de `type`), `resolveOutcome` (`retenter` : n'accepté que si tentative == 1, boucle vers `lecture`, sans re-file ni délai ; branche `reveler` supprimée — tout est déjà divulgué), `beginFeynman` (transition inconditionnelle vers Feynman, quel que soit le verdict — plus de garde ni de journalisation d'override), `feynman` (tours L4 enrichis du dernier brouillon de blurting, transcript édité, clôture L5), `validateSection` (Feynman **obligatoire pour toute importance 2 à 5** — une seule voie ; **auto-note FSRS obligatoire** (paramètre `note`) pour clore, quelle que soit la Nᵉ fois → `validee`/`en_revision` + S6.createOrRate ; `Again` ⇒ S5.refile, cf. §7), `abandon` (ferme le cycle proprement, aucune StudySession supprimée — ADR 6, réutilisée telle quelle par REVAMP v2), `resume`. ~~`rateRevision`~~ supprimée (2026-07-15) : absorbée dans `validateSection`, plus de chemin de notation séparé.
- **Invariants possédés** : session unique ouverte ; sauvegarde avant LLM ; sessions immuables (toute tentative = nouvelle session) ; divulgation appliquée serveur.

### S5 · PlannerService — l'organe central

- **Points d'entrée** : `todayQueue` (P7 sur l'état courant), `horizon` (P8), `refile` (élément regénéré → queue du jour ; expiration en fin de journée : révision ⇒ dette visible, étude ⇒ retour au vivier), `defer` (journalise ; révision ⇒ dette ; étude ⇒ slot perdu, sans remplacement), `reorder` (permutation datée, purgée à minuit), `attentionBadges` (rubriques à valider, cours modifiés, chapitres non triés, suggestion d'archivage à examen + 7 j).

### S6 · ReviewService — l'échéancier

- **Points d'entrée** : `createCard` (unicité par section), `rate` (P9 ; la note utilisateur, jamais le verdict LLM — ADR 3), `createOrRate` (**nouveau, 2026-07-15** : seul point d'entrée désormais appelé par `S4.validateSection` — crée la carte si absente (1ʳᵉ validation) PUIS la note dans la foulée, sinon note l'existante ; compose `createCard`+`rate` tels quels, ne les remplace pas), `preview` (P9.previewIntervals, U18), `freeze`/`unfreeze` (**le seul propriétaire du gel**, invoqué par S1.archive, S2.setImportance(1) et la cascade — trois appelants, une implémentation ; dégel : FSRS recalcule depuis les dates réelles).

### S7 · ErrorService — le carnet

- **Points d'entrée** : `commitCandidates` (règle de commit É3.3 : acceptées ⇒ créées ; sortie d'écran sans statuer ⇒ auto-acceptées ; récidive : l'id retourné par L3 incrémente le compteur de l'erreur active au lieu de créer un doublon), `list` (filtres matière/statut/type/section), `resolve`, `edit`, `delete` (confirmation), `activeFor(section|matière)` (source unique des contextes LLM — seules les actives sont consommées).

### S8 · AuditService — journalisation transverse

- **Objectif** : LA définition unique de « journalisé » (six occurrences éparses en v0.1).
- **Fonctionnement** : événements typés {override de verdict, révélation de correction, report, acquittement d'anomalie, validation sur insuffisant}, horodatés, rattachés à leur entité. Consommé par les vues (badge « override » sur une session) et par toi (lucidité sur tes propres contournements — c'est une donnée pédagogique, pas du flicage).

### S9 · AccountService — configuration & données

- `updatePlannerConfig`, `updateMethodology` (globale + surcharges matière), CRUD matières (date d'examen alimentant P7/P8), `exportUserData` (JSON complet, archives et journaux compris).

## 4. Server Actions — règle unique

Une action par point d'entrée de service exposé à l'UI. Contenu type : authentification → validation Zod de l'entrée (schémas **partagés** avec les formulaires côté client — une seule définition) → appel du service → retour typé. **Toute action dépassant ce gabarit est un défaut de revue** : la logique doit descendre dans un service.

## 5. Tâches de fond

| Tâche                              | Déclencheur                        | Délègue à          |
| ---------------------------------- | ---------------------------------- | ------------------ |
| Génération paresseuse de rubriques | périodique + recomposition de file | S3.lazyScheduler   |
| Expiration de la re-file           | fin de journée                     | S5.refile          |
| Purge de l'ordre manuel            | minuit                             | S5                 |
| Suggestion d'archivage             | quotidien (examen + 7 j)           | S5.attentionBadges |

---

## 6. Module UI (`components/`)

### 6.1 Coquilles & primitives (réutilisation maximale)

| #   | Composant                         | Rôle & règles                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | **AppShell**                      | Barre latérale permanente (Aujourd'hui · Curriculum · Erreurs · Réglages) + indicateur « session en cours — reprendre » (alimenté par S4.resume) sur toutes les pages.                                                                                                                                                                                                                              |
| U2  | **FocusShell**                    | Coquille des P3/P4 : pas de navigation, barre de progression du cycle, sortie = sauvegarde. Sanctuarise le mode focus.                                                                                                                                                                                                                                                                              |
| U3  | **MarkdownViewer**                | Rendu d'un chapitre : gras et commentaires stylés distinctement (mêmes couleurs partout). Utilisé par É1.2, É6.1, panneau vis-à-vis des rubriques.                                                                                                                                                                                                                                                  |
| U4  | **CourseEditor (WYSIWYG Tiptap)** | Édition **façon Google Docs**, limitée aux trois constructions FORMAT (Titres 1–3, gras, italique — la barre d'outils EST la convention ; gras+italique impossible à saisir) + **validation continue de la hiérarchie** (P2) + AnomalyPanel intégré + sérialisation Markdown pour le stockage (TECH_MAPPING §5). Utilisé par É1.1/É1.2 (corrections inline), É6.2, corrections inline du ré-import. |
| U5  | **AnomalyPanel**                  | Liste d'anomalies cliquables (scroll vers l'occurrence), acquittement individuel ou global. Trois écrans consommateurs.                                                                                                                                                                                                                                                                             |
| U6  | **DiffViewer**                    | Rendu de P5 côte à côte/inline ; surlignage spécifique « sera écrasé » (retouches locales). É6.3 + historique É6.1.                                                                                                                                                                                                                                                                                 |
| U7  | **ConsequencesDialog**            | LE dialogue de pré-commit : « version N→N+1 · X intactes · Y rubriques invalidées · Z à trier · W archivées ». Partagé É6.2/É6.3 — un seul rendu du bilan de S1.simulateUpdate.                                                                                                                                                                                                                     |
| U8  | **ConfirmDialog**                 | Confirmations graduées : légère (override) / forte (nom à retaper pour suppression, l'archivage proposé en premier).                                                                                                                                                                                                                                                                                |
| U9  | **EmptyState / ErrorState**       | États vides didactiques et erreurs LLM honnêtes (`[Relancer]` + voie de secours) — chaque écran DOIT les déclarer (règle transversale 7).                                                                                                                                                                                                                                                           |

### 6.2 Composants de domaine

| #   | Composant                  | Rôle & règles                                                                                                                                                                                                                                                                                                     |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U10 | **DailyQueue + QueueCard** | File du jour : réordonnancement manuel roi — boutons/poignées shadcn v1, drag & drop HTML5 natif en amélioration progressive (TECH_MAPPING §4.2) —, section « à repasser aujourd'hui » distincte, badges retard, compte à rebours d'examen (< 30 j), `[Reporter]`, indicateur discret « X révisions repoussées ». |
| U11 | **HorizonChart**           | P8 : charge de révision 7/30 j (étiquetée), dette, répartition matière, marqueurs d'examens. Rendu en **barres pures Tailwind/CSS stylées shadcn** — aucune lib de charts (TECH_MAPPING §4.2).                                                                                                                    |
| U12 | **AttentionBadges**        | Badges d'accueil (S5.attentionBadges), chacun lien direct vers l'écran de résolution.                                                                                                                                                                                                                             |
| U13 | **TriageList / TriageRow** | É1.4 : titre éditable inline, sélecteur segmenté 1..5 (3 présélectionné), fusion/scission, aperçu dépliable, compteur d'en-tête.                                                                                                                                                                                  |
| U14 | **RubricEditor**           | Relecture/édition d'une rubrique : points groupés par type, édition/suppression/ajout, section en vis-à-vis (U3). Utilisé en validation autonome ET en étape 0 du cycle (É3.0) — même composant, deux contextes.                                                                                                  |
| U15 | **BlurtingEditor**         | Zone plein écran, chrono discret, Markdown accepté, **aucun accès au cours** (pas de lien, garanti par la composition : U15 ne reçoit jamais le contenu du chapitre en props). Étude (instruction adaptée à la tentative : n°1 grandes lignes, n°2 détail — REVAMP v2) ET révision (badge de type).               |
| U16 | **CorrectionView**         | Diff groupé ✅/❌/⚠️ **toujours affiché en entier** (divulgation toujours complète, P10 supprimé — REVAMP v2, 2026-07-15), verdict « proposé » purement informatif, boutons d'issue selon la tentative (1 : relire+refaire / Feynman / abandonner ; 2 : Feynman / abandonner). Seul écran de correction depuis la fusion Machine B/C (2026-07-15) — étude ET révision y passent identiquement, U18 ne s'y branche plus (déplacé en bilan, É3.5). |
| U25 | **LectureView**            | Assemblage U2 (FocusShell) + U3 (MarkdownViewer) sur le contenu de la section + `[Je suis prêt, je blurte]` + `[Abandonner]`. Deux contextes : lecture initiale et relecture ciblée — même texte, même composant, seule la prop `relecture` (booléen, cosmétique) change le badge affiché ; **v0.7, 2026-07-15** : le diff (U16.`DiffList`) en vis-à-vis retiré de l'écran. `[Je suis prêt, je blurte]` ouvre un compte à rebours de 30s (`[Passer maintenant]` en échappatoire, `[Abandonner]` toujours dispo) avant d'appeler `S4.terminerLecture` — **v0.6, 2026-07-15** : retour sur le comportement structurel sans minuteur de la v0.4. |
| U17 | **ErrorCandidatesPanel**   | Candidates « proposées » : édition, suppression, `[Tout accepter]`, badge récidive ; même divulgation contrôlée que le diff ; commit via S7 (y compris auto-acceptation à la sortie).                                                                                                                             |
| U18 | **FsrsRatingBar**          | Again/Hard/Good/Easy avec échéance prévisionnelle sous chaque bouton (P9.preview) ; verdict affiché à côté, explicitement non contraignant. Déplacé sur l'écran de bilan Feynman (É3.5, 2026-07-15 — anciennement écran de correction en révision) : condition nécessaire à la clôture de TOUT cycle, plus seulement de la révision. |
| U19 | **FeynmanChat**            | Bulles, streaming des relances (L4), TTS optionnel, `[Clore et demander le bilan]`. Compose U20.                                                                                                                                                                                                                  |
| U20 | **PushToTalkRecorder**     | Micro maintenu/verrouillable → L6 → **transcript éditable avant envoi** → bascule clavier toujours visible ; ré-écoute + réessai sur échec ; l'audio ne survit pas à la confirmation du transcript.                                                                                                               |
| U21 | **FeynmanReportView**      | Bilan L5 : par point de contrôle {démontré/récité/non abordé}, points solides, lacunes, verdict proposé. Compose U18 (2026-07-15) : la validation exige l'auto-note FSRS, actions (refaire / revenir au blurting) restées à part.                                                                               |
| U22 | **CurriculumTree**         | Arbre matières→chapitres→sections : pastilles de statut, importances, échéances, recherche ; fiches matières (date d'examen, surcharge méthodologie, archivage).                                                                                                                                                  |
| U23 | **ImportWizard**           | Enchaîne les étapes de P1 (destination → import → rapport → sectionnement en streaming → tri) avec persistance de reprise entre étapes. Réutilise U4/U5, U13.                                                                                                                                                     |
| U24 | **ErrorNotebook**          | É5.1 : filtres, compteurs de récidive, liens vers sessions d'origine (lecture seule), actions S7.                                                                                                                                                                                                                 |

### 6.3 Matrice écran → composants (les écrans sont des assemblages)

| Écran (USER_FLOW)      | Assemblage                              |
| ---------------------- | --------------------------------------- |
| É2.0 Accueil           | U1 + U10 + U11 + U12                    |
| P1 Import (É1.0–É1.4)  | U1 + U23 (U4, U5, U13)                  |
| É1.5/É3.0 Rubrique     | U14 (+ U3)                              |
| É3.1 Lecture (étude uniquement, 2 occurrences) | U2 + U25 (U3) |
| É3.2 Blurting (étude ET révision — fusion Machine B/C) | U2 + U15                |
| É3.3 Correction (étude ET révision)                    | U2 + U16 + U17           |
| É3.4 Feynman           | U2 + U19 (U20)                          |
| É3.5 Bilan (+ auto-note FSRS obligatoire, U18 déplacé ici depuis la fusion 2026-07-15) | U2 + U21 + U18 |
| É5.1 Carnet            | U1 + U24                                |
| É6.0/É6.1 Curriculum   | U1 + U22 + U3 + U6 (historique)         |
| É6.2 Éditeur           | U1 + U4 + U5 + U7 + U8                  |
| É6.3 Ré-import         | U1 + U4/U5 + U6 + U7 + U8               |
| P7 Réglages            | U1 + formulaires (schémas Zod partagés) |

**Gains de réutilisation actés** : le couple blurting/correction (U15/U16/U17) sert quatre écrans ; l'éditeur validé (U4/U5) trois ; le dialogue de conséquences (U7) et le RubricEditor (U14) deux chacun. Tout écran nouveau doit d'abord se composer de l'existant.

---

## 7. Registre des invariants — un propriétaire chacun

| Invariant                                       | Propriétaire        | Renfort                                                                              |
| ----------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------ |
| Une seule session ouverte par utilisateur       | S4                  | index unique partiel `StudyCycle(user_id) WHERE closed_at IS NULL` (ARCHITECTURE §8) |
| Aucune étude sans rubrique `valide`             | S3                  | contrainte DB                                                                        |
| Sauvegarde avant tout appel LLM                 | S4                  | ordre transactionnel                                                                 |
| Sessions & erreurs passées immuables            | S1 (cascade) + S4   | pas d'UPDATE, INSERT only                                                            |
| Jamais de commit de version sans simulation     | S1                  | API en deux temps                                                                    |
| Gel/dégel des ReviewCards                       | S6                  | trois appelants, une implémentation                                                  |
| Seules les erreurs `actives` alimentent les LLM | S7.activeFor        | ContextBuilders (L0)                                                                 |
| « Journalisé » = AuditService                   | S8                  | —                                                                                    |
| OpenRouter uniquement via L0                    | L0                  | revue de code                                                                        |

---

## Annexe A — Impacts modèle de données (inchangés depuis USER_FLOW annexe A, à répercuter dans ARCHITECTURE.md)

## Annexe B — Correspondance v0.1 → v0.2

| v0.1                 | v0.2                                       |
| -------------------- | ------------------------------------------ |
| F1–F3                | P1–P3                                      |
| F4, F5, F7, F61, F62 | S1                                         |
| F6, F10, F11         | P5, P4, S1.commitUpdate                    |
| F12–F15              | L1, P6, S2                                 |
| F16–F18              | L2, S3                                     |
| F20–F24              | P7, P8, S5                                 |
| F30–F37              | S4 (+ P10, L3–L5)                          |
| F40–F44              | P9, S6, S4.rateRevision                    |
| F50–F51              | S7                                         |
| F60, F63, F80–F81    | S9                                         |
| F70–F72              | L0, L6, mapping modèles                    |
| F82                  | S4.resume + U1                             |
| — (nouveaux)         | S8 (audit), U1–U24 (UI), tâches de fond §5 |

## Journal des versions

| Version | Date       | Changement                                                                                                                                                                                                                                                     |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.7     | 2026-07-15 | U25 LectureView : retrait du `DiffList` (U16) affiché en vis-à-vis lors de la relecture ciblée — l'écran ne montre plus que le texte, dans les deux contextes. La prop `diff`/`MergedDiffPoint[]` est remplacée par un booléen `relecture` (cosmétique, pilote uniquement le badge). `S4.lectureContext` inchangée (continue de calculer le diff, plus consommé côté UI). Voir ARCHITECTURE.md, USER_FLOW.md v0.8, DECISIONS.md. |
| 0.6     | 2026-07-15 | Retour (post-hoc, avec l'humain) sur U25 LectureView : `[Je suis prêt, je blurte]` ouvre désormais un compte à rebours de 30s avant l'appel à `S4.terminerLecture`, `[Passer maintenant]` en échappatoire — annule le comportement « structurel, sans minuteur » posé en v0.4. Comportement purement client, `S4.terminerLecture` inchangée. Voir ARCHITECTURE.md v0.14, USER_FLOW.md v0.7, DECISIONS.md. |
| 0.5     | 2026-07-15 | DECISIONS.md (« Suppression de la dualité étude\|révision », post-hoc REVAMP.md) : S4 perd `rateRevision` (absorbée dans `validateSection`, qui gagne un paramètre `note` obligatoire) ; S6 gagne `createOrRate` ; U18 FsrsRatingBar déplacé de l'écran de correction (révision) vers le bilan Feynman (É3.5, toute répétition) ; U16 CorrectionView devient le seul écran de correction (étude ET révision identiques) ; matrice §6.3 fusionne les lignes É3.x/É4.x. |
| 0.4     | 2026-07-15 | REVAMP.md v0.3 (tranché avec l'humain, DECISIONS.md) : P10 `presentCorrection` supprimée (divulgation toujours complète, `computeVerdict` déplacé dans `core/correction/verdict.ts`) ; S4 gagne `terminerLecture`, `submitBlurting`/`resolveOutcome`/`beginFeynman`/`validateSection` réécrits (2 passes max, plus de retenter-différé/révéler/override/validation-sans-Feynman) ; U16 simplifié (divulgation toujours complète) ; nouveau U25 `LectureView` ; matrice §6.3 renumérotée (É3.1 Lecture, É3.2 Blurting, É3.3 Correction, É3.4 Feynman, É3.5 Bilan) ; invariant « divulgation contrôlée côté serveur » retiré du registre §7 (plus d'objet). |
| 0.3     | 2026-07-02 | Alignement TECH_MAPPING v0.2 : U4 = CourseEditor WYSIWYG Tiptap (3 constructions), U10 = réordonnancement shadcn + drag HTML5 natif, U11 = barres Tailwind pures.                                                                                              |
| 0.2     | 2026-07-02 | Refonte en 4 couches après auto-critique : 10 cœurs purs, 7 appels LLM, 9 services propriétaires d'invariants, Server Actions réduites à des adaptateurs, module UI (24 composants + matrice d'assemblage), registre des invariants, correspondance v0.1→v0.2. |
| 0.1     | 2026-07-02 | Création — 40 fonctions plates                                                                                                                                                                                                                                 |
