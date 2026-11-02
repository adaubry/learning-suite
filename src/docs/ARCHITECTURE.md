# ARCHITECTURE.md — v2 : fiches, cycle unique, planificateur

> **Statut** : v2.0 (2026-11-02). Réécriture complète. La v1 (import de cours bruts, sectionnement et rubriques par LLM, dialogue Feynman) est close : son historique vit dans git (dernier commit v1 : `0e8055f`). Voir DECISIONS.md.
> **Rôle** : source de vérité structurelle. Une demande qui contredit ce document se signale avant d'agir.

---

## 1. Principes

1. **Le planificateur est l'organe central.** L'accueil est la file du jour. FSRS décide quand revoir chaque fiche ; l'étudiant n'a plus à trouver lui-même son rythme.
2. **La fiche est l'unité.** Une fiche (≤ 1 page, produite hors de l'app) = une carte FSRS = une cible de rappel. L'app ne découpe rien et ne génère aucune rubrique : la structure de la fiche (thèse, étiquettes, tableaux) EST le barème (FORMAT.md).
3. **Un seul appel LLM** : la correction d'un blurting contre les points de la fiche. Tout le reste est du code déterministe.
4. **Le LLM propose, l'utilisateur dispose.** Le verdict de correction met en avant un bouton ; l'utilisateur clique. FSRS est piloté par l'auto-note, jamais par le verdict.
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
        │ soumission : sauvegarde PUIS correction LLM
        ▼
   correction n°1 ── verdict « bon » ─────▶ [Noter] Again/Hard/Good/Easy ─▶ clos
        │
        └─ verdict « insuffisant » (bouton mis en avant, mais l'utilisateur choisit)
               ▼
          relecture (fiche complète)
               │ [Je suis prêt] → 30 s + puzzle d'échecs
               ▼
          blurting n°2 → correction n°2 ─▶ [Noter] Again/Hard uniquement ─▶ clos
```

Règles :

- **Révision = rappel à froid** : une fiche `en_revision` commence directement au blurting, sans lecture.
- **2 blurtings maximum** par cycle ; le 2ᵉ n'existe qu'après une relecture.
- **Verdict** (calculé en code, pas par le LLM) : `insuffisant` si un point `critique` (thèse, Définition, Texte) est manquant ou déformé, sinon `bon`. Il choisit le bouton primaire : `insuffisant` → [Relire puis refaire], `bon` → [Noter]. Les deux restent toujours disponibles à la tentative 1.
- **Note après relecture : Again ou Hard uniquement.** Avoir eu besoin de relire, c'est un rappel à froid raté ; c'est ce que FSRS doit enregistrer. La 2ᵉ passe sert à apprendre, pas à mesurer. (Invariant tenu par SessionService.)
- **Raisonnement** : les points étiquetés Cause/Conséquence/Logique sont notés à part (« raisonnement : x/y »), pour distinguer « tu as donné la règle » de « tu as dit pourquoi ».
- **Again ⇒ re-file** : la fiche revient en fin de file du jour même.
- **[Abandonner]** est toujours disponible : ferme le cycle, aucune note, aucune trace visible ensuite (les tentatives restent en base, immuables).
- Une tentative est **sauvegardée avant** tout appel LLM ; en cas d'échec, [Relancer la correction] rejoue sans re-saisie.
- **Une seule session ouverte par utilisateur** (index unique partiel en base).

## 3. Le planificateur

```
file_du_jour =
    revisions_dues      ReviewCard.due ≤ aujourd'hui, non gelées
                        triées par (retard DESC, proximité d'examen)
  + nouvelles_fiches    fiches `nouvelle` jamais étudiées
                        triées par (proximité d'examen, ordre : matière → set importé → numéro)
                        plafonnées à config.nouvelles_par_jour
  + re_file             notes Again du jour, en fin de file
```

- Les révisions passent toujours avant les nouvelles fiches.
- Réordonnancement manuel du jour (QueueOrder) ; report (DeferralLog) : révision reportée = reste due ; nouvelle fiche reportée = slot perdu.
- « Avancer une fiche de demain » depuis l'état vide : emprunte un slot de demain.
- Horizon 7/30 j : charge de révisions, dette, examens.

## 4. Modèle de données (Drizzle, `src/db/schema.ts`)

```
user              Better-Auth (src/db/auth-schema.ts)
planner_config    user_id PK, nouvelles_par_jour, debut_s3/debut_s4,
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
                  input, correction JSONB, verdict bon|insuffisant, created_at — INSERT puis
                  un seul UPDATE (la correction), jamais modifiée ensuite
error_entry       subject_id, fiche_id, tentative_id, type omission|deformation|confusion|imprecision,
                  description, statut active|resolue, occurrences
deferral_log, refile_item, queue_order   planificateur (mono-utilisateur)
prompt_log        journal de chaque appel LLM
deadline, alert, serie_gel               écran Régularité (IMPLEMENT_SCHEDULE.md)
```

## 5. Import et ré-import

- Entrée : Markdown exporté de Google Docs (Fichier → Télécharger → Markdown) ou collé. Format : FORMAT.md.
- Le parseur (`src/core/fiche/`) découpe par titre 2, extrait numéro et titre, conserve le corps tel quel.
- **Ré-import d'un set existant** : appariement des fiches par titre normalisé, puis par numéro. Fiche appariée et modifiée ⇒ contenu mis à jour, **historique FSRS conservé**. Fiche nouvelle ⇒ `nouvelle`. Fiche disparue ⇒ `archivee`, carte gelée. Fiche réapparue ⇒ restaurée, carte dégelée.
- Archiver un set ou une matière gèle ses cartes ; désarchiver les dégèle en décalant `due` de la durée du gel.

## 6. Points de contrôle d'une fiche

Calculés à la volée depuis le corps de la fiche (`extractPoints`, pur), jamais stockés :

| Élément de la fiche | Type | Raisonnement |
|---|---|---|
| Thèse (1er paragraphe non étiqueté) | critique | non |
| **Définition**, **Texte** | critique | non |
| **Cause**, **Conséquence**, **Logique** | important | oui |
| **Constat**, **Nuance**, **Exemple**, **Piège**, étiquette inconnue | important | non |
| **Lien** | secondaire | non |
| **Complément (hors cours)** | exclu, jamais exigé | — |
| Ligne de tableau | important | non |
| Liste ou paragraphe non étiqueté | important | non |

La correction LLM reçoit ces points numérotés et renvoie un statut par point (couvert / manquant / déformé) + des erreurs candidates. Le mapping index → point se fait en code.

## 7. LLM

- Un seul point d'accès : `src/llm/client.ts` (OpenRouter, clé serveur, validation zod, retry avec réinjection d'erreur, PromptLog).
- Un seul appel : `correction_erreurs` (prompt `prompts/correction_fiche.vN.md`, modèle `LLM_MODEL_CORRECTION_ERREURS`).
- Contexte : points de la fiche, blurting, n° de tentative, erreurs actives de la fiche.

## 8. Invariants et propriétaires

| Invariant | Propriétaire | Renfort |
|---|---|---|
| Une seule session ouverte par utilisateur | SessionService | index unique partiel |
| Tentative sauvegardée avant l'appel LLM | SessionService | ordre des écritures |
| ≤ 2 blurtings par cycle ; relecture seulement après la tentative 1 | SessionService | — |
| Note après relecture ∈ {Again, Hard} | SessionService | test canari |
| FSRS piloté par la note utilisateur, jamais le verdict | ReviewService | test canari |
| Ré-import : historique FSRS conservé pour les fiches appariées | FicheService | test canari |
| Gel/dégel des cartes | ReviewService | — |
| OpenRouter uniquement via `src/llm/client.ts` | L0 | revue |

## 9. Couches

`app/` (écrans + Server Actions minces : auth → zod → un service → retour) → `src/services/` → `src/core/` (pur) + `src/llm/` + `src/db/`.

## 10. Hors périmètre

Génération de fiches dans l'app (elle se fait en amont), dialogue oral / Feynman, multi-utilisateur, mobile natif, import PDF.
