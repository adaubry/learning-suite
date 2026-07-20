# Spec d'implémentation — Écran « Régularité » (gestion du temps)

> Document destiné à Claude Code. À suivre dans l'ordre des étapes de la §9.
> Framework UI : **astryx** — les composants sont décrits par contrat (props, états, comportement), pas par code. Utiliser les primitives astryx existantes (toast, banner, checkbox, badge, sheet…) partout où elles existent.

## 1. Contexte et objectif

L'application repose sur des cycles blurting → Feynman planifiés par FSRS (voir `schema.ts`). Le Planificateur décide _quoi_ faire ; l'écran Régularité montre _où l'étudiant en est dans le temps_ et l'empêche de rater une échéance. Trois fonctions :

1. **Échéances** : une checklist unique de toutes les deadlines du semestre (examens ponctuels, contrôles continus récurrents), cochables pour les faire disparaître. Aucun pourcentage de couverture ou de complétion nulle part — cette donnée est incalculable.
2. **Régularité** : heatmap façon GitHub (intensité = nombre de sessions terminées par jour), série de jours actifs avec mécanisme de gel (streak freeze), métriques simples.
3. **Alertes** : système à trois niveaux (bannière persistante / toast actionnable / toast éphémère) + centre d'alertes (cloche).

Principes UX issus de la recherche (à respecter strictement) :

- Un toast ne porte JAMAIS une information critique. Une échéance proche ⇒ bannière persistante, pas un toast qui disparaît.
- Un toast avec bouton d'action reste affiché jusqu'à dismissal explicite ; un toast informatif s'auto-ferme en 5 s.
- Maximum 3 toasts empilés simultanément ; au-delà, file d'attente.
- L'urgence affichée doit être réelle (vraies dates), jamais artificielle ; pas de compte à rebours anxiogène en heures/minutes — granularité « J-x ».
- La série exploite la loss aversion mais ne doit pas punir : gels de série disponibles, et un jour sans travail dû ne casse pas la série.

## 2. Périmètre

**Inclus** : nouvelle route/écran « Régularité », deux nouvelles tables + colonnes de config, un moteur d'alertes, un hôte de toasts global (réutilisable par toute l'app), seed des échéances S3/S4.
**Exclus** : toute modification du Planificateur, de FSRS, des cycles d'étude. L'écran est en lecture + acquittement uniquement (sauf CRUD des échéances).

## 3. Modifications du schéma (drizzle)

Ajouter à `schema.ts` :

```ts
// --- Échéances (deadlines) ---
export const deadlineTypeEnum = pgEnum("deadline_type", [
  "examen", // ponctuel : écrit 3h coef 2, écrit/oral 1h30 coef 1
  "controle_continu", // occurrence d'une évaluation récurrente (TD hebdo)
  "autre", // rendu de devoir, inscription, etc.
]);

export const deadline = pgTable("deadline", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id").references(() => subject.id), // nullable : "autre" peut être hors matière
  type: deadlineTypeEnum("type").notNull(),
  libelle: text("libelle").notNull(), // "Écrit 3h", "CC TD séance 4"…
  dueDate: date("due_date").notNull(),
  coefficient: real("coefficient"), // 2, 1, null si non noté
  dureeMin: integer("duree_min"), // 180, 90, null
  // Les récurrences sont DÉPLIÉES à la création : une ligne par occurrence,
  // reliées par recurrenceGroupId (doctrine simplicité : pas de moteur de rrule).
  recurrenceGroupId: uuid("recurrence_group_id"),
  ackAt: timestamp("ack_at", { withTimezone: true }), // cochée => disparaît de la liste
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- Alertes ---
export const alertTypeEnum = pgEnum("alert_type", [
  "echeance_j7",
  "echeance_j3",
  "echeance_j1",
  "echeance_jour_j",
  "echeance_depassee", // dueDate < today ET ackAt IS NULL
  "serie_en_peril", // 0 session aujourd'hui, heure > heureAlerteSerie
  "dette_reports", // reports en attente >= seuil
  "pic_charge", // charge FSRS d'un jour J-1/J d'échéance > 2x moyenne 14 j
]);

export const alert = pgTable(
  "alert",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: alertTypeEnum("type").notNull(),
    deadlineId: uuid("deadline_id").references(() => deadline.id), // nullable (serie/dette/charge)
    dateRef: date("date_ref").notNull(), // date du jour de génération : clé d'idempotence
    payload: jsonb("payload"), // libellé pré-calculé, compteurs…
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    snoozedUntil: date("snoozed_until"), // "me rappeler demain"
  },
  (t) => [
    uniqueIndex("alert_dedupe").on(
      t.type,
      t.dateRef,
      sql`coalesce(${t.deadlineId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
  ],
);

// --- Gels de série (streak freeze) : une ligne = un jour protégé ---
export const serieGel = pgTable("serie_gel", {
  date: date("date").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

Étendre `plannerConfig` (mêmes conventions que `ttsActive`) :

```ts
debutS3: date("debut_s3"),                 // lundi de la semaine 1 du S3 → labels sXs3
debutS4: date("debut_s4"),
gelsSerieRestants: integer("gels_serie_restants").notNull().default(2),
heureAlerteSerie: text("heure_alerte_serie").notNull().default("20:00"), // "HH:MM"
seuilDetteReports: integer("seuil_dette_reports").notNull().default(3),
```

Notes de migration : `subject.dateExamen` reste (rétrocompat) mais devient obsolète pour l'affichage — l'écran ne lit QUE `deadline`. Écrire un script de seed qui crée les deadlines du S3/S4 depuis la maquette du cursus (les 2 écrits 3h coef 2 du S3, les 4 écrits/oraux 1h30 coef 1, l'anglais, les CC TD dépliés semaine par semaine) avec des dates placeholder que l'utilisateur corrigera via l'UI.

## 4. Logique dérivée (aucune table supplémentaire)

Tout le reste se calcule à la lecture :

- **Heatmap** : `SELECT created_at::date AS jour, count(*) FROM study_session GROUP BY 1` sur la plage du semestre. Buckets d'intensité : 0 / 1-2 / 3-4 / 5+. Surcouches : bordure rouge si une `deadline` non-"autre" tombe ce jour ; teinte violette si `serie_gel` contient ce jour ; contour fort = aujourd'hui ; les jours futurs sont grisés mais affichent déjà les marqueurs d'échéances.
- **Label de semaine** : `s{floor((jour - debutSx)/7) + 1}s{3|4}` selon que `jour >= debutS4` ou non. Si `debutS3` est null, afficher un empty state invitant à configurer la date dans les réglages.
- **Série** : nombre de jours consécutifs (en remontant depuis aujourd'hui) où `sessions(jour) >= 1 OU serie_gel(jour) existe`. Aujourd'hui ne casse pas la série tant que la journée n'est pas finie. Meilleure série : même calcul sur tout l'historique.
- **Dette de reports** : `count(DISTINCT item_id) FROM deferral_log WHERE avance = false` dont l'item est encore présent dans `refile_item` à une date <= aujourd'hui (réutiliser la logique existante du Planificateur si un service l'expose déjà — ne pas dupliquer).
- **Charge 14 j** : par jour sur [aujourd'hui, +14] : `count(review_card WHERE due = jour AND gelee = false) + nouvellesParJour`. Marqueurs verticaux aux `deadline.dueDate` non acquittées.

## 5. Moteur d'alertes

Une fonction pure + idempotente `generateAlerts(now: Date)` exécutée : (a) à chaque chargement de l'app, (b) via un cron quotidien si l'infra en a un (sinon (a) suffit — mono-utilisateur). Elle INSÈRE dans `alert` avec `ON CONFLICT DO NOTHING` grâce à l'index `alert_dedupe`. Elle ne supprime ni ne modifie jamais.

Règles de génération (deadlines : uniquement `ackAt IS NULL`) :

| Type                | Condition                                                                  | Portée                                             |
| ------------------- | -------------------------------------------------------------------------- | -------------------------------------------------- |
| `echeance_j7`       | `dueDate - today == 7`                                                     | examens uniquement (pas les CC, sinon spam hebdo)  |
| `echeance_j3`       | `== 3`                                                                     | examens coef >= 2                                  |
| `echeance_j1`       | `== 1`                                                                     | examens + CC                                       |
| `echeance_jour_j`   | `== 0`                                                                     | examens + CC                                       |
| `echeance_depassee` | `dueDate < today`                                                          | toutes ; régénérée chaque jour tant que non cochée |
| `serie_en_peril`    | 0 session aujourd'hui ET heure locale >= `heureAlerteSerie` ET série >= 3  | évaluée côté client (timer), insérée à l'affichage |
| `dette_reports`     | dette >= `seuilDetteReports`                                               | 1 fois par jour max (dateRef)                      |
| `pic_charge`        | charge(J-1 ou J d'une échéance examen) > 2 × moyenne de la charge sur 14 j | par deadline                                       |

Cycle de vie : une alerte est visible si `dismissedAt IS NULL AND (snoozedUntil IS NULL OR snoozedUntil <= today)`. Cocher une deadline dismisse automatiquement toutes ses alertes. Le centre d'alertes (cloche) liste les visibles puis l'historique (30 j).

## 6. Routage des alertes vers l'UI (critique — ne pas dévier)

| Canal                                                     | Types                                                                | Comportement                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bannière** (haut d'écran, globale à l'app)              | `echeance_j3`, `echeance_j1`, `echeance_jour_j`, `echeance_depassee` | Persistante, ne s'auto-ferme pas. Fond danger. Une seule à la fois : la plus urgente (jour_j > j1 > depassee > j3). Actions : « Voir » (ouvre l'écran Régularité) et « Reporter à demain » (`snoozedUntil = demain`) — sauf `jour_j` et `depassee`, non snoozables.                                |
| **Toast actionnable** (persistant jusqu'à action/dismiss) | `echeance_j7`, `serie_en_peril`, `dette_reports`, `pic_charge`       | Icône + titre + 1 ligne + 1-2 actions. `serie_en_peril` : actions « Démarrer une session » (deep-link Planificateur) et « Utiliser un gel » (si `gelsSerieRestants > 0` : insère `serie_gel(today)`, décrémente). `dette_reports` : « Rattraper » (deep-link file du jour). Croix = `dismissedAt`. |
| **Toast éphémère** (5 s, auto-dismiss)                    | confirmations locales                                                | « Échéance cochée — Annuler » (undo remet `ackAt = null`), « Gel utilisé », « Record de série : 22 j ». Jamais généré par le moteur : purement client.                                                                                                                                             |

Contraintes d'implémentation du `ToastHost` : pile max 3 + file FIFO ; desktop bas-droite, mobile haut pleine largeur ; `aria-live="polite"` pour les toasts, `role="alert"` (assertive) pour la bannière ; pause du timer au hover/focus ; respecter `prefers-reduced-motion`.

## 7. Écran Régularité — composition

Wireframes de référence : voir la conversation (v2). Hiérarchie desktop, de haut en bas :

1. `AlertBanner` (global, rendu par le layout de l'app, pas par l'écran).
2. `RegulariteHeader` : chip semaine courante (`s5·s3`), série + gels restants, sessions du jour, `AlertBell` avec badge du nombre d'alertes visibles.
3. Grille 2 colonnes (1fr / 1.2fr) :
   - Gauche — `DeadlineChecklist` : toutes les deadlines `ackAt IS NULL` triées par `dueDate`. Chaque ligne : checkbox, pill « J-x » (danger si < 7 j, warning si < 14 j, neutre sinon ; « J+x » sur fond danger si dépassée), libellé + matière, icône récurrence pour les CC, coefficient à droite. Cocher : animation de sortie + toast undo. Bouton « Ajouter » → formulaire (type, matière, libellé, date, coef, durée, récurrence hebdo × n occurrences qui déplie les lignes). Éditer/supprimer via menu contextuel de ligne ; supprimer une occurrence récurrente propose « celle-ci / toutes les suivantes » (via `recurrenceGroupId`).
   - Droite — `ActivityHeatmap` (colonnes = semaines labellisées, lignes = L→D, légende, tooltip par case : date, n sessions, échéances du jour) puis `ChargeChart` (barres 14 j, marqueurs d'échéances, message si pic) et `StatsPanel` (jours actifs 7 j, dette, meilleure série).

Mobile : pile verticale — bannière, header compact, `DeadlineChecklist` (coche par swipe, 5 premières + « tout voir »), heatmap en scroll horizontal centrée sur la semaine courante, stats en une ligne. Le `ChargeChart` passe en 7 j.

Guidelines astryx : réutiliser les primitives (checkbox, badge/pill, toast, banner, bottom-sheet pour le formulaire mobile, popover pour la cloche). Tokens sémantiques du thème pour danger/warning/success — aucune couleur codée en dur. La heatmap est le seul composant custom : la construire en CSS grid de `div` (pas de lib de charting pour ça), cases 12-14 px, `role="img"` + `aria-label` résumant la période.

## 8. Critères d'acceptation

1. Cocher une deadline la retire de la liste, dismisse ses alertes, affiche un toast undo 5 s ; l'undo restaure tout.
2. Une deadline examen coef 2 à J-3 produit une bannière persistante qui survit au rechargement et n'apparaît qu'une fois (idempotence vérifiée en appelant `generateAlerts` deux fois).
3. Une deadline dépassée non cochée génère une bannière non snoozable chaque jour.
4. Aucun pourcentage de couverture/complétion n'apparaît nulle part.
5. La heatmap affiche l'intensité par nombre de sessions (`study_session`), les jours d'échéance encerclés, les gels en violet, les labels `sXsY` corrects de part et d'autre de la frontière S3/S4.
6. « Utiliser un gel » n'est proposé que si `gelsSerieRestants > 0` ; le gel protège la série du jour et la heatmap le montre.
7. Jamais plus de 3 toasts affichés ; un toast avec action ne s'auto-ferme pas ; un toast info s'auto-ferme en 5 s (timer en pause au hover).
8. `serie_en_peril` ne se déclenche pas si une session a été faite, si la série < 3 j, ou avant `heureAlerteSerie`.
9. Tests unitaires : calcul de série (avec gels, trous, aujourd'hui incomplet), labels de semaine (frontière S3/S4, `debutS3` null), règles du moteur d'alertes (chaque ligne du tableau §5), dédup.

## 9. Ordre d'implémentation (A → Z)

1. **Migration** : enums + tables `deadline`, `alert`, `serie_gel` + colonnes `planner_config` (§3). Générer et appliquer la migration drizzle.
2. **Seed** : script des échéances S3/S4 (dates placeholder, CC dépliés).
3. **Services** : `deadlineService` (CRUD + ack/unack + dépliage récurrence), `statsService` (heatmap, série, semaine, dette, charge — §4), `alertEngine.generateAlerts` + `alertService` (visibles, dismiss, snooze) (§5).
4. **Tests unitaires** des services (critère 9) — avant toute UI.
5. **`ToastHost` global** + API `toast.info/action` (§6) ; brancher `AlertBanner` dans le layout racine.
6. **Écran Régularité** : header, `DeadlineChecklist` + formulaire, `ActivityHeatmap`, `ChargeChart`, `StatsPanel`, `AlertBell` (§7). Desktop puis responsive mobile.
7. **Intégration** : entrée de navigation, appel de `generateAlerts` au boot, timer client `serie_en_peril`, deep-links vers le Planificateur.
8. **Vérification finale** : dérouler les critères §8 un par un ; ajouter un test e2e « J-3 → bannière → cocher → disparition ».
