# ARCHITECTURE.md — v2 : fiches, cycle unique, planificateur

> **Statut** : v2.1 (2026-11-02). v2.1 : la correction LLM est remplacée par une auto-évaluation (comparaison côte à côte + cases à cocher), plus aucun appel LLM.
> v2.0 (2026-11-02). Réécriture complète. La v1 (import de cours bruts, sectionnement et rubriques par LLM, dialogue Feynman) est close : son historique vit dans git (dernier commit v1 : `0e8055f`). Voir DECISIONS.md.
> **Rôle** : source de vérité structurelle. Une demande qui contredit ce document se signale avant d'agir.

---

## 1. Principes

1. **Le planificateur est l'organe central.** L'accueil est la file du jour. FSRS décide quand revoir chaque fiche ; l'étudiant n'a plus à trouver lui-même son rythme.
2. **La fiche est l'unité.** Une fiche (≤ 1 page, produite hors de l'app) = une carte FSRS = une cible de rappel. L'app ne découpe rien et ne génère aucune rubrique : la structure de la fiche (thèse, étiquettes, tableaux) EST le barème (FORMAT.md).
3. **Aucun LLM.** L'étudiant se corrige lui-même : sa restitution et la fiche côte à côte, et il coche les points de la fiche qu'il a restitués. Tout est déterministe, instantané et gratuit.
4. **L'étudiant décide.** Le bilan de ses cases met un bouton en avant ; il clique. FSRS est piloté par son auto-note.
5. **Mono-utilisateur, simplicité d'abord.**

## 2. Le cycle (machine unique)

```
           fiche nouvelle                      fiche en révision
                │                                     │
                ▼                                     │
   lecture (fiche complète)                           │
        │ [Je suis prêt] → 30 s + puzzle d'échecs     │
        ▼                                             ▼
   blurting n°1 (aucun accès à la fiche) ◀────────────┘
        │ soumission
        ▼
   comparaison n°1 (restitution | fiche, cases à cocher)
        │ ── bilan « bon » ─────▶ [Noter] Again/Hard/Good/Easy ─▶ clos
        │
        └─ verdict « insuffisant » (bouton mis en avant, mais l'utilisateur choisit)
               ▼
          relecture (fiche complète)
               │ [Je suis prêt] → 30 s + puzzle d'échecs
               ▼
          blurting n°2 → comparaison n°2 ─▶ [Noter] Again/Hard/Good/Easy ─▶ clos
```

Règles :

- **Révision = rappel à froid** : une fiche `en_revision` commence directement au blurting, sans lecture.
- **2 blurtings maximum** par cycle ; le 2ᵉ n'existe qu'après une relecture.
- **Comparaison** : la restitution et la fiche côte à côte ; sous la restitution, les points de la fiche (§6) à cocher. Le **bilan** (calculé en code, `core/fiche/verdict`) donne points cochés, essentiels cochés, raisonnement coché, et un verdict : `insuffisant` si un point `critique` (thèse, Définition, Texte) n'est pas coché, sinon `bon`. Il choisit le bouton primaire : `insuffisant` → [Relire puis refaire], `bon` → [Noter]. Les deux restent toujours disponibles à la tentative 1. Les cases sont enregistrées sur la tentative en quittant l'écran.
- **Note libre, y compris après relecture** (décision de l'humain, remplace « Again/Hard seulement ») : l'écran de la 2ᵉ passe rappelle le bilan de la 1ʳᵉ, à froid, pour que la note reflète le rappel réel.
- **Démarrer une session est une action explicite** (formulaire [Commencer]) ; afficher `/etude/[ficheId]` ne démarre jamais rien (lecture seule de l'état), pour qu'un préchargement de lien ne crée pas de session.
- **Raisonnement** : les points étiquetés Cause/Conséquence/Logique sont comptés à part (« raisonnement : x/y »), pour distinguer « j'ai donné la règle » de « j'ai dit pourquoi ».
- **Carnet d'erreurs** : depuis chaque point, l'étudiant consigne une erreur (oubli, déformation, confusion, imprécision) ; les erreurs actives de la fiche s'affichent à la comparaison suivante.
- **Again ⇒ re-file** : la fiche revient en fin de file du jour même.
- **[Abandonner]** est toujours disponible : ferme le cycle, aucune note, aucune trace visible ensuite (les tentatives restent en base, immuables).
- **Une seule session ouverte par utilisateur** (index unique partiel en base).

## 3. Le planificateur

```
file_du_jour =
    revisions_dues      ReviewCard.due ≤ aujourd'hui, non gelées
                        triées par (retard DESC, proximité d'examen)
  + nouvelles_fiches    fiches `nouvelle` jamais étudiées
                        triées par (proximité d'examen, ordre : matière → set importé → numéro)
                        toutes par défaut ; plafonnées à config.nouvelles_par_jour s'il est fixé
  + re_file             notes Again du jour, en fin de file
```

- Les révisions passent toujours avant les nouvelles fiches.
- **Plafond optionnel** (Réglages, désactivé par défaut) : sans plafond, toutes les nouvelles fiches sont dans la file. Avec un plafond, une nouvelle fiche étudiée ou reportée dans la journée consomme son slot ; « avancer une fiche de demain » (état vide) emprunte un slot de demain.
- Réordonnancement manuel du jour (QueueOrder) ; report (DeferralLog) : révision reportée = reste due ; nouvelle fiche reportée = retirée de la file du jour.
- Horizon 7/30 j : charge de révisions, dette, examens.

## 4. Modèle de données (Drizzle, `src/db/schema.ts`)

```
user              Better-Auth (src/db/auth-schema.ts)
planner_config    user_id PK, nouvelles_par_jour (NULL = sans plafond), debut_s3/debut_s4,
                  gels_serie_restants, heure_alerte_serie, seuil_dette_reports
subject           matière : nom, semestre, ordre, date_examen, statut active|archivee, archived_at
fiche_set         set de fiches importé : subject_id, titre, markdown (dernier import),
                  content_hash, imported_at, statut actif|archive, archived_at
fiche             set_id, numero, titre, contenu (markdown du corps), content_hash,
                  statut nouvelle|en_revision|archivee
review_card       fiche_id UNIQUE, état FSRS (due, stability, difficulty, reps, lapses,
                  last_review), gelee
study_cycle       user_id, fiche_id, type etude|revision (label), etat lecture|blurting|correction|clos,
                  note (again|hard|good|easy, posée à la clôture), closed_at, created_at
                  UNIQUE(user_id) WHERE closed_at IS NULL
tentative         cycle_id, fiche_id, fiche_hash (version de la fiche corrigée), numero (1|2),
                  input, correction JSONB { coches: index des points cochés }, verdict bon|insuffisant,
                  created_at — INSERT au blurting puis un seul UPDATE (l'auto-évaluation)
error_entry       subject_id, fiche_id, tentative_id, type omission|deformation|confusion|imprecision,
                  description, statut active|resolue, occurrences
deferral_log, refile_item, queue_order   planificateur (mono-utilisateur)
deadline, alert, serie_gel               écran Régularité (IMPLEMENT_SCHEDULE.md)
```

## 5. Import et ré-import

- Entrée : Markdown exporté de Google Docs (Fichier → Télécharger → Markdown) ou collé. Format : FORMAT.md.
- Le parseur (`src/core/fiche/`) découpe par titre 2, extrait numéro et titre, conserve le corps tel quel.
- **Ré-import d'un set existant** : appariement des fiches par titre normalisé, puis par numéro. Fiche appariée et modifiée ⇒ contenu mis à jour, **historique FSRS conservé**. Fiche nouvelle ⇒ `nouvelle`. Fiche disparue ⇒ `archivee`, carte gelée. Fiche réapparue ⇒ restaurée, carte dégelée.
- Archiver un set ou une matière gèle ses cartes ; désarchiver les dégèle en décalant `due` de la durée du gel.

## 6. Points de contrôle d'une fiche

La liste à cocher de la comparaison. Calculés à la volée depuis le corps de la fiche (`extractPoints`, pur), jamais stockés :

| Élément de la fiche | Type | Raisonnement |
|---|---|---|
| Thèse (1er paragraphe non étiqueté) | critique | non |
| **Définition**, **Texte** | critique | non |
| **Cause**, **Conséquence**, **Logique** | important | oui |
| **Constat**, **Nuance**, **Exemple**, **Piège**, étiquette inconnue | important | non |
| **Lien** | secondaire | non |
| **Complément (hors cours)** | exclu, jamais à cocher | — |
| Ligne de tableau | important | non |
| Liste ou paragraphe non étiqueté | important | non |

Les cases cochées sont stockées par index : elles se lisent contre la fiche telle qu'elle était à cette tentative (`tentative.fiche_hash`).

## 7. Pas de LLM

v2.0 corrigeait chaque blurting par un appel OpenRouter (~10 s, ~6 000 tokens). v2.1 l'a retiré au profit de l'auto-évaluation (DECISIONS.md 2026-11-02) : le code (`src/llm/`, `prompts/`) est dans l'historique git.

## 8. Invariants et propriétaires

| Invariant | Propriétaire | Renfort |
|---|---|---|
| Une seule session ouverte par utilisateur | SessionService | index unique partiel |
| ≤ 2 blurtings par cycle ; relecture seulement après la tentative 1 | SessionService | — |
| FSRS piloté par la note utilisateur | ReviewService | test canari |
| Ré-import : historique FSRS conservé pour les fiches appariées | FicheService | test canari |
| Gel/dégel des cartes | ReviewService | — |

## 9. Couches

`app/` (écrans + Server Actions minces : auth → zod → un service → retour) → `src/services/` → `src/core/` (pur) + `src/db/`.

## 10. Hors périmètre

Génération de fiches dans l'app (elle se fait en amont), correction par LLM, dialogue oral / Feynman, multi-utilisateur, mobile natif, import PDF.
