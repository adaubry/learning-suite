# REVAMP.md — Passage du cycle d'étude v1 → v2 (rituel lecture/blurting/Feynman)

> **Statut** : v0.3 — §2 tranché avec l'humain (2026-07-15). Reste à faire avant tout code : consigner ces arbitrages dans DECISIONS.md et bumper ARCHITECTURE/USER_FLOW/FUNCTIONS en conséquence (§5 dernière table, §6 étape 1). Une question reste ouverte, posée en tête de §2 (immutabilité de l'abandon) — à répondre avant de coder l'étape correspondante.
> **Contexte** : la doctrine v1 de Machine B (ARCHITECTURE §5, §11 ; USER_FLOW É3.1–É3.2) repose sur l'anti-illusion de fluence — divulgation contrôlée + jamais de retry immédiat — et suppose que la lecture du cours se fait HORS app (Google Doc, cours/TD) : `BlurtingEditor` (U15) ne reçoit jamais le contenu, et rien dans Machine B ne montre la section avant le blurting. L'utilisateur a explicitement rejeté les deux : (1) il veut un rituel en 2 passes de blurting dans la même séance (grandes lignes → relecture → détail), avec verdict informatif plutôt que bloquant, puis un Feynman qui se construit sur son brouillon ; (2) **la lecture du cours doit être une étape de l'app elle-même, contrôlée par Machine B** — pas une hypothèse silencieuse sur ce que l'étudiant a fait ailleurs. L'app devient un espace d'étude complet : lecture → blurting → Feynman, tout sous son toit. C'est un changement de doctrine, pas un bug.
> **Dépend de** : ARCHITECTURE.md v0.11, FUNCTIONS.md v0.3, USER_FLOW.md v0.4, DECISIONS.md (à compléter).
> **Hors périmètre de ce document** : Machine C / révision (P4), import (P1), curriculum (P6), carnet d'erreurs (P5) — non concernés par la demande, voir §4.

---

## 1. Résumé du changement

Cinq ruptures avec la doctrine v1, toutes localisées dans **Machine B / étude uniquement** :

| # | v1 (actuel) | v2 (décidé) |
|---|---|---|
| A | Divulgation contrôlée : intitulés seuls tant qu'un retry est possible | Divulgation toujours complète, dès la 1ʳᵉ correction — le blurting n'est plus un test à protéger, c'est une étape d'un rituel que l'étudiant pilote lui-même |
| B | Jamais de retry immédiat : un verdict insuffisant repart en re-file (délai forcé), tentatives illimitées | Exactement 2 passes de blurting max, la 2ᵉ **immédiate**, dans la même séance, après une relecture |
| C | Feynman gated sur verdict `acquis` (sinon override journalisé obligatoire) | Feynman **toujours** atteint après la 2ᵉ passe (ou après la 1ʳᵉ si acquis) — aucune notion d'override, aucune trace d'audit, c'est le chemin normal |
| D | La lecture du cours n'existe pas dans Machine B : hypothèse silencieuse qu'elle a eu lieu ailleurs (Google Doc) avant que la section n'entre en étude | La lecture devient un **état à part entière de Machine B**, dans l'app, deux fois : avant le 1ᵉʳ blurting (lecture complète) et avant le 2ᵉ (relecture ciblée sur les manques de la 1ʳᵉ correction). L'app contrôle qu'elle a bien lieu, dans l'ordre, avant de débloquer le blurting suivant |
| E | Feynman optionnel pour importance 2 (`[Valider sans Feynman]` disponible sur verdict acquis) | Feynman **obligatoire pour toute importance de 2 à 5**. Le bouton et le chemin « valider sans Feynman » sont supprimés — plus simple, une seule voie de validation |

Le verdict LLM (`acquis`/`insuffisant`) reste calculé et affiché — la doctrine « le LLM propose, l'utilisateur dispose » (ARCHITECTURE §1.3) est *renforcée*, pas abandonnée : il ne bloque plus rien, il informe.

**Sur l'invariant U15 (`BlurtingEditor` sans accès au cours)** : il survit tel quel — il protège l'écran de *blurting*, pas le cycle entier. La lecture et le blurting restent deux écrans strictement séparés dans Machine B (jamais de tabs/split), donc jamais de contenu qui « fuit » pendant qu'on rédige.

---

## 2. Décisions — tranchées avec l'humain (2026-07-15)

### Question restée ouverte (à répondre avant l'étape correspondante en §6)

**2.3bis — Portée exacte de « abandonner comme si la tentative n'avait jamais existé »** : en lisant `session.ts`, la fonction `abandon` existante fait déjà presque ça — elle ferme le cycle (`closedAt` + `etat: "clos"`) SANS appeler `commitCandidates` (aucune erreur candidate n'est acceptée), sans toucher au statut de la section, sans créer de `ReviewCard`. La prochaine fois que l'étudiant démarre cette section, `start()` ouvre un **nouveau** `StudyCycle` : le compteur de tentatives (`nextTentative`, scopé au cycle) repart à zéro. Fonctionnellement, plus rien de l'ancienne tentative n'est visible ni comptabilisé nulle part.
Mais les lignes `StudySession` de la tentative abandonnée restent en base, intouchées — c'est l'invariant **« Sessions & erreurs passées immuables : INSERT only »** (ARCHITECTURE §7, ADR 6), qui sert l'historique/l'audit ailleurs dans le produit.
**Question** : « comme si elle n'avait jamais existé » veut-il dire (a) ce comportement déjà existant (invisible en avant, mais trace DB immuable conservée), ou (b) une suppression physique des lignes en base, ce qui casserait l'invariant ADR 6 pour ce cas précis ?
→ Je recommande (a) — réutiliser `abandon` tel quel, aucune nouvelle fonction — mais je ne le décide pas seul : ADR 6 est un invariant documenté, y déroger même pour un cas précis se tranche explicitely, pas en silence.

### Décisions tranchées

1. **Portée de l'abandon de la divulgation contrôlée** → **on supprime la fonction si elle ne sert plus** (règle générale posée par l'humain, cf. point 1 ci-dessous appliqué à P10). Voir §4/§5 : `presentCorrection` n'a plus aucun appelant avec `retryAttendu: true` nulle part dans le système après ce changement (étude : toujours `false` désormais ; révision et bilan Feynman : déjà toujours `false`) — la fonction est un pur passe-plat, sans utilité restante. **Décision : la supprimer.** Conséquence signalée (règle de l'humain : « si elle sert pour des cas très limités, dis-le et demande ») : sa suppression emporte celle de `presentCorrection.canary.test.ts`, qui teste précisément la branche `retryAttendu: true` devenue morte — supprimer un test `@canary` requiert une autorisation explicite (AGENTS §2.5), donnée ici implicitement par la règle posée, mais **à confirmer au moment de coder cette étape précise** (§6) avant de toucher au fichier de test.
2. **`[Valider sans Feynman]`** → **supprimé**. Toutes les importances 2 à 5 passent par le Feynman ; il n'existe plus de validation directe sur simple blurting. Système plus simple (une seule voie de validation), moins de code (branche entière retirée de `validateSection` et de `correction-view.tsx`).
3. **Report de la 2ᵉ passe en cas d'échec** → **supprimé**, remplacé par **`[Abandonner]` rendu disponible à l'écran de correction** (il existait déjà à l'écran de blurting, USER_FLOW É3.1 ; il manquait à l'écran de correction où « Retenter plus tard » jouait ce rôle). Abandonner ferme le cycle proprement (cf. 2.3bis ci-dessus) ; l'étudiant peut redémarrer la section plus tard comme si de rien n'était.
4. **Audit sur Feynman malgré verdict insuffisant** → **on arrête complètement de logger cet événement.** Aucun appel `auditService.logEvent` à ce point de `beginFeynman` ; aucune notion d'override, aucune confirmation supplémentaire à l'écran.
5. **Documents à mettre à jour** → confirmé, obligatoire (§5 dernière table).
6. **Lecture chronométrée ou seulement structurelle** → **seulement structurelle.** L'étudiant avance quand il veut, mais ne peut pas sauter l'étape (pas de bouton blurting accessible avant d'être passé par l'écran de lecture). Pas de minuteur.
7. **Diff affiché à côté du texte pendant la relecture ciblée** → **oui.** `lecture_2` montre `DiffList` (déjà en divulgation complète) à côté du texte de la section.

---

## 3. Le nouveau cycle d'étude (Machine B v2)

```
debut ──▶ lecture_1 (NOUVEAU — texte complet de la section, U3 dans FocusShell)
             │ [Je suis prêt, je blurte] (structurel, pas de minuteur — §2.6)
             │ [Abandonner] toujours disponible (comme aujourd'hui en blurting)
             ▼
        blurting_1 (grandes lignes — instruction UI, pas de contrat LLM différent,
             │        AUCUN accès au cours sur cet écran — U15 inchangé)
             │ soumission
             ▼
        correction_1 (L3 inchangé, verdict proposé, divulgation TOUJOURS complète)
             │
             ├── [Passer au Feynman] ──────────────────────────────────────────┐
             │   (toujours disponible, quel que soit le verdict)                │
             ├── [Relire, puis refaire un blurting] (si tentative == 1) ───┐    │
             │                                                             │    │
             └── [Abandonner] (ferme le cycle, §2.3bis)                    │    │
                                                                            ▼    │
             lecture_2 (NOUVEAU — texte de la section + diff de correction_1     │
                         à côté, pour orienter la relecture — §2.7)              │
                 │ [Je suis prêt, je blurte]                                     │
                 ▼                                                              │
             blurting_2 (détail — instruction UI, aucun accès au cours)          │
                 │ soumission                                                    │
                 ▼                                                              │
             correction_2 (L3 inchangé, divulgation complète, PAS de 3ᵉ passe)   │
                 │ seul choix : [Passer au Feynman] ────────────────────────────┘
                 ▼
             feynman_en_cours (L4, contexte enrichi du brouillon de blurting —
                                 OBLIGATOIRE pour toute importance 2 à 5, §1.E)
                 │ clôture utilisateur
                 ▼
             bilan_feynman (L5, inchangé) → validation → validee
```

Différences structurelles avec v1 :
- **aucune re-file, aucun délai, aucun état "clos puis réouvert plus tard"** pour l'étude — tout se joue dans le même `StudyCycle`, la même séance ;
- **la lecture est désormais un état du cycle** (`lecture`), pas une hypothèse hors-système ;
- **une seule voie de sortie** : Feynman, toujours — plus de raccourci « validé sans Feynman » ;
- **`[Abandonner]` est la seule échappatoire** si l'étudiant ne veut pas continuer — pas de report, pas de délai.

---

## 4. Ce qui NE change PAS (garde-fou anti-scope-creep)

- **Machine C / révision** (P4, `rateRevision`) : intacte. Elle n'a jamais eu de retry à protéger (divulgation déjà complète d'emblée) — le rituel v2 ne la concerne pas.
- **Rubrique** (L2, `rubrique.v1.md`, GuideService) : intacte. Aucun changement de contrat, de schéma, de prompt.
- **Correction** (L3, `correction_erreurs.v1.md`, `correctBlurting`, `computeVerdict`) : intacte. Même appel, même schéma, même verdict calculé en code.
- **Bilan Feynman** (L5, `feynman_bilan.v1.md`, `computeFeynmanVerdict`) : intact.
- **Import, curriculum, carnet d'erreurs, planificateur (hors refile étude), FSRS** : intacts.
- **`abandon`** (S4) : réutilisée telle quelle (sous réserve de 2.3bis) — pas de nouvelle fonction d'annulation.

---

## 5. Impact par brique

### Cœurs purs (`src/core/`)
| Brique | Action |
|---|---|
| `core/correction/presentCorrection.ts` (fonction `presentCorrection`) | **Supprimer.** Plus aucun appelant avec `retryAttendu: true` après ce changement (§2.1) — la fonction ne fait plus que recopier les champs tels quels avec `divulgation` figée à `"complete"`. Les types `FilteredDiffPoint`/`FilteredErrorCandidate`/`FilteredCorrection` se simplifient en un seul type chacun (fusion avec `MergedDiffPoint`/`MergedErrorCandidate`/`Correction`, déjà quasi identiques une fois `retryAttendu` toujours faux). |
| `presentCorrection.canary.test.ts` | **Supprimer** — ne teste plus qu'une branche morte. Autorisation déjà donnée par la règle posée en §2.1 ; **reconfirmer explicitement au moment de coder cette étape** avant de toucher au fichier (AGENTS §2.5). |
| `core/correction/computeVerdict` | **Réutiliser, déplacer** dans un fichier propre (ex. `core/correction/verdict.ts`) puisque `presentCorrection.ts` disparaît — reste affiché comme « verdict proposé », non bloquant. |
| `core/feynman/computeFeynmanVerdict.ts` | **Réutiliser tel quel.** |

### LLM (`src/llm/`, `prompts/`)
| Brique | Action |
|---|---|
| `llm/correctBlurting.ts`, `llm/context/correction.ts`, `prompts/correction_erreurs.v1.md` | **Réutiliser tel quel.** Aucun changement de contrat — la distinction « grandes lignes / détail » est une instruction d'interface (U15), pas une consigne au LLM. |
| `llm/generateGuide.ts`, `prompts/rubrique.v1.md` | **Réutiliser tel quel.** |
| `llm/context/feynmanTurn.ts` (`FeynmanTurnContextInput`/`FeynmanTurnContext`) | **Modifier** : ajouter un champ `brouillon: string` (dernier texte de blurting soumis pour ce cycle) — traversé tel quel jusqu'au prompt. |
| `llm/feynmanTurn.ts` | **Modifier légèrement** : rien à changer côté appel L0, juste le contrat de contexte élargi ci-dessus. |
| `prompts/feynman_turn.v2.md` | **Créer `feynman_turn.v3.md`** : ajoute une section `<brouillon>` (le plan de l'étudiant) + une consigne : construire les relances comme un développement progressif de CE brouillon plutôt que comme une exploration libre de la rubrique. Entrée PROMPTS_CHANGELOG.md obligatoire + `npm run evals` avant bascule. |
| `prompts/feynman_bilan.v1.md` | **Réutiliser tel quel** (le bilan reste ancré sur la rubrique, pas sur le brouillon). |

### Services (`src/services/session.ts`)
| Fonction | Action |
|---|---|
| `start` | **Modifier** : un cycle d'étude démarre désormais dans l'état `lecture` (pas `blurting`) — `.values({ ..., etat: "lecture" })`. Révision inchangée (pas de phase de lecture, §4). |
| **`terminerLecture`** (nouvelle fonction) | Transition seule (même patron que `beginFeynman`) : `lecture → blurting`. Appelée depuis les deux écrans de lecture (initiale et ciblée) — un seul point d'entrée. |
| `submitBlurting` | **Modifier** : garde `tentative > 2 ⇒ throw` pour `cycleType === "etude"` ; garde d'état existante (`etat !== "blurting" ⇒ throw`) couvre déjà le refus depuis `lecture`. |
| `runCorrection` | **Modifier** : arrête d'appeler `presentCorrection` (supprimée) — persiste et renvoie directement `{ verdict, diff, erreursCandidates }` sans filtrage. `retryAttendu`/`divulgation` disparaissent du flux (colonne DB `divulgation` conservée pour la cohérence des lignes historiques, cf. DB ci-dessous, mais plus jamais lue en logique). |
| `getCurrentCorrection` | **Modifier** : idem, ré-sert `{ verdict, diff, erreursCandidates }` directement depuis la ligne persistée, sans passer par `presentCorrection`. |
| `resolveOutcome` | **Réécrire** : supprime la branche `"reveler"` (sans objet, tout est déjà divulgué) ; renomme/recentre `"retenter"` → transition qui (a) n'appelle **plus** `plannerService.refile("etude", …)`, (b) n'est acceptée que si `tentative === 1`, (c) boucle vers **`lecture`** (pas directement `blurting`), immédiatement, même séance. Ajoute une branche `"abandonner"` explicite si ce n'est pas déjà géré par un appel direct à `abandon` depuis l'écran de correction. |
| `beginFeynman` | **Modifier** : retire le garde `verdict === "insuffisant" ⇒ override obligatoire` ET l'appel `auditService.logEvent("override_verdict", …)` (§2.4) — transition inconditionnelle `correction → feynman`. |
| `feynmanTurn`, `openingTurn`, `streamAndPersistTurn` | **Modifier** : charger le dernier `StudySession` de type `blurting` du cycle (`latest.input`) et le passer en `brouillon` à `buildFeynmanTurnContext`. |
| `validateSection` | **Simplifier** : supprime la branche `else` (validation sans Feynman, importance < 3) — une seule voie : `cycle.etat === "bilan"` obligatoire, quelle que soit l'importance de la section (§1.E). Moins de code qu'aujourd'hui. |
| `abandon` | **Réutiliser tel quel** (sous réserve de la réponse à 2.3bis). |

### UI (`src/components/`)
| Composant | Action |
|---|---|
| **`lecture-view.tsx`** (nouveau, assemblage U2 + U3) | Écran plein écran (FocusShell) : `MarkdownViewer` (U3) sur `section.contenu` + bouton `[Je suis prêt, je blurte]` → `terminerLectureAction`. Deux contextes via une prop : lecture initiale (texte seul) vs relecture ciblée (texte + `DiffList` réutilisée telle quelle, §2.7). |
| `blurting-editor.tsx` (U15) | **Modifier légèrement** : texte d'instruction dépendant de `tentative` (1 = « grandes lignes, comme un plan » ; 2 = « développe maintenant »). Aucun accès au cours — invariant inchangé. |
| `correction-view.tsx` (U16) | **Modifier en profondeur** pour `mode === "etude"` : supprimer `revelerAction`/`isRevealed`/l'avertissement « réponses masquées » (mort, rupture A) ; supprimer la prop `divulgation` (toujours `"complete"`, plus rien à afficher conditionnellement) ; supprimer `terminerAction`/`[Valider sans Feynman]`/la prop `importance` (rupture E) ; remplacer le branchement sur `verdict` par un branchement sur `tentative` (`tentative === 1` → `[Relire puis refaire un blurting]` + `[Passer au Feynman]` + `[Abandonner]` ; `tentative === 2` → `[Passer au Feynman]` + `[Abandonner]`). `mode === "revision"` intact (U18 `FsrsRatingBar` inchangé). |
| `feynman-chat.tsx`, `feynman-report-view.tsx` | **Réutiliser tel quel.** |

### Base de données
**Une migration.** `study_cycle_etat` (enum Postgres, `src/db/schema.ts:47`) gagne la valeur `"lecture"` : `["rubrique_a_valider", "lecture", "blurting", "correction", "feynman", "bilan", "clos"]` (`ALTER TYPE … ADD VALUE`). Aucune autre colonne requise (pas de colonne « mode », dérivée de `tentative` à la volée ; pas de colonne d'horodatage, §2.6 tranché sans suivi de durée).
La colonne `study_session.divulgation` (enum `"controlee" | "complete"`) **n'est pas retirée** : les lignes historiques v1 en `"controlee"` restent immuables (ADR 6) et le type de colonne doit continuer à les représenter fidèlement. Pour toute nouvelle ligne d'étude créée après la bascule, la valeur écrite sera systématiquement `"complete"` (littéral, plus de logique conditionnelle).

### Documentation (préalable, obligatoire)
- ARCHITECTURE.md → v0.12 (§5 diagramme Machine B, §11 principe restreint à la révision/au bilan, suppression de « Feynman optionnel importance 2 »)
- USER_FLOW.md → v0.5 (É3.1/É3.2 réécrites + nouvelles étapes de lecture ; suppression de `[Valider sans Feynman]`, `[Retenter plus tard]`, `[Révéler les réponses]`)
- FUNCTIONS.md → v0.4 (S4, §7 invariants — « divulgation contrôlée » et « Feynman requis ≥ 3 seulement » retirés du registre)
- DECISIONS.md → nouvelle entrée (ce §2, daté 2026-07-15)
- PROMPTS_CHANGELOG.md → entrée feynman_turn v2→v3

---

## 6. Ordre d'implémentation (fonction par fonction, CLAUDE.md §1)

1. Documents (§5 dernier tableau) — geler la nouvelle doctrine par écrit avant tout code, y compris la réponse à 2.3bis.
2. Migration `study_cycle_etat` + `"lecture"`.
3. `start` (démarre en `lecture` pour l'étude) + `terminerLecture` (transition `lecture → blurting`) + leurs tests.
4. Extraire `computeVerdict` dans son propre fichier ; supprimer `presentCorrection` et ses types `Filtered*` (fusionnés dans les types `Merged*`/`Correction`) — **confirmer une dernière fois avant de supprimer `presentCorrection.canary.test.ts`** (§2.1, AGENTS §2.5).
5. `runCorrection`/`getCurrentCorrection` (arrêt d'appel à `presentCorrection`, retour direct) + leurs tests.
6. `submitBlurting` (garde `tentative > 2`) + ses tests.
7. `resolveOutcome` réécrit (suppression `reveler`, `retenter` sans refile → boucle vers `lecture`, gate `tentative === 1`, branche `abandonner` explicite si besoin) + ses tests — **vérifier qu'aucun test `@canary` ne teste l'ancien comportement de refile en étude** (le seul refile canary existant concerne la révision `Again`, hors périmètre).
8. `beginFeynman` (suppression du garde + de l'appel d'audit) + tests.
9. `validateSection` simplifié (suppression de la branche sans Feynman) + tests.
10. `llm/context/feynmanTurn.ts` (+`brouillon`) + son canary existant à mettre à jour (contrat de contexte, pas un canary anti-hallucination gelé — à vérifier au moment de coder).
11. `feynmanTurn`/`openingTurn`/`streamAndPersistTurn` (chargement + passage du brouillon).
12. `prompts/feynman_turn.v3.md` + PROMPTS_CHANGELOG.md + `npm run evals`.
13. `lecture-view.tsx` (nouveau composant, deux contextes : lecture initiale / relecture avec diff).
14. `blurting-editor.tsx` (instruction selon tentative).
15. `correction-view.tsx` (boutons selon tentative, retrait complet du mécanisme de révélation et de « valider sans Feynman », ajout d'`[Abandonner]`).
16. `npm run check` + `npm run test:canary` + test navigateur du parcours complet (lecture 1 → blurting 1 → correction → relecture ciblée → blurting 2 → correction → Feynman → bilan → validation), pour au moins deux importances différentes (plus de distinction 2 vs ≥3 puisque Feynman est désormais uniforme, mais vérifier que la rubrique elle-même varie bien selon les sections testées).

---

## 7. Tests & canaris

- **Nécessite une autorisation explicite avant modification** (AGENTS §2.5) : `presentCorrection.canary.test.ts` — sa suppression découle de la règle générale posée en §2.1, mais reste un canari ; reconfirmer au moment de l'étape 4 (§6) avant de toucher au fichier.
- **Ne pas toucher** : les canaris de révision (`Again`/refile, hors périmètre).
- **À ajouter** : cap à 2 tentatives (soumettre une 3ᵉ fois ⇒ erreur) ; `terminerLecture` refuse depuis un autre état que `lecture` ; `resolveOutcome` n'appelle plus `plannerService.refile` en étude et boucle vers `lecture`, pas `blurting` ; `beginFeynman` ne journalise plus rien et n'exige plus de confirmation quel que soit le verdict ; `validateSection` refuse désormais systématiquement hors de l'état `bilan`, quelle que soit l'importance ; `feynmanTurn` reçoit bien le dernier blurting comme `brouillon`.
- **À revoir** : tout test existant (`session.test.ts`, `session.canary.test.ts`) qui exerce encore l'ancien chemin `reveler`/retry différé/validation sans Feynman en étude, ou qui suppose qu'un cycle démarre directement en `blurting` — à identifier précisément en ouvrant les fichiers avant de coder, pas supposé ici.

---

## 8. Definition of done

1. §2 tranché (fait), 2.3bis répondu, documents mis à jour en conséquence (pas après-coup).
2. Étapes de §6 livrées fonction par fonction, chacune testée avant la suivante.
3. `npm run check` + `npm run test:canary` verts ; `npm run evals` vert après la bascule du prompt Feynman.
4. Parcours navigateur manuel déroulé en entier.
5. Suppression de `presentCorrection.canary.test.ts` explicitement reconfirmée avant d'être exécutée — pas de canari supprimé par simple déduction de règle générale sans repasser par l'humain à ce moment précis.

---

## Journal des versions

| Version | Date | Changement |
|---|---|---|
| 0.1 | 2026-07-15 | Création — plan de bascule v1 → v2 du cycle d'étude (blurting 2 passes + Feynman non gated), non arbitré. |
| 0.2 | 2026-07-15 | Correction signalée par l'humain : la v0.1 laissait la lecture du cours hors app. Ajout de la rupture D : deux états `lecture` dans Machine B, nouveau composant `lecture-view.tsx`, migration d'enum, nouvelle fonction `terminerLecture`. |
| 0.3 | 2026-07-15 | §2 tranché avec l'humain : suppression de `presentCorrection` (règle « pas de fonction inutile », avec canary à confirmer avant suppression) ; suppression de `[Valider sans Feynman]` — Feynman obligatoire pour toute importance (rupture E) ; suppression du report, ajout d'`[Abandonner]` à l'écran de correction ; arrêt total du logging d'audit sur l'entrée en Feynman ; lecture structurelle sans minuteur ; diff affiché pendant la relecture ciblée. Question ouverte ajoutée (2.3bis) sur la portée exacte de l'abandon vis-à-vis de l'immutabilité des sessions (ADR 6). |
