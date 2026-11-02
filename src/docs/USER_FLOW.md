# USER_FLOW.md — v2 : écrans

> **Statut** : v2.0 (2026-11-02). Réécriture complète (fiches, cycle unique). Règle transversale : chaque écran a un état vide, et chaque appel LLM a un état d'erreur avec relance.

## Accueil — la file du jour (`/`)

- Liste ordonnée : révisions dues, puis nouvelles fiches (plafond du jour), puis re-file. Chaque ligne : titre de la fiche, set, matière, badge (Révision — retard / Nouvelle / À repasser).
- Actions par ligne : [Commencer] → cycle ; monter / descendre / en tête ; [Reporter].
- Horizon 7/30 j sous la file.
- **Sans aucune fiche** : « Importer un premier set de fiches » → `/importer`.
- **File vide** : « Rien à faire aujourd'hui », prochaine échéance, [Avancer une fiche de demain].
- Bandeau de reprise si une session est ouverte.

## Import (`/importer`)

1. Choisir la matière (ou en créer une), le titre du set (prérempli depuis le nom du fichier), déposer le `.md` ou coller le texte. Option : ré-importer un set existant.
2. **Aperçu** : liste des fiches détectées (numéro, titre, nombre de points, avertissements : pas de thèse, aucun point). En ré-import : statut par fiche (inchangée / modifiée / nouvelle / retirée).
3. [Importer] → retour au curriculum. Erreur bloquante si aucune fiche n'est détectée.

## Curriculum (`/curriculum`)

- Matières (créer, modifier, date d'examen, archiver, supprimer avec double confirmation) → sets (ré-importer, archiver, supprimer) → fiches (statut, prochaine révision, lien vers la fiche).
- Fiche (`/fiche/[id]`) : lecture seule de la fiche, historique de ses sessions.

## Session (`/etude/[ficheId]`, mode focus, sans navigation)

1. **Lecture** (nouvelle fiche, ou relecture) : fiche complète. [Je suis prêt] → 30 s avec puzzle d'échecs, [Passer maintenant] ; [Abandonner].
2. **Blurting** : titre seul, aucun accès à la fiche. Badge « Nouvelle » ou « Révision — Nᵉ rappel », tentative n°1/2, chrono discret. [Soumettre] ; [Abandonner].
3. **Correction** : ta restitution, verdict proposé, résumé « raisonnement x/y », liste des points (couvert / manquant / déformé, explication, attendu), erreurs candidates (rejetables).
   - Tentative 1 : [Relire puis refaire] et [Noter], le bouton primaire suit le verdict.
   - Notation : Again / Hard / Good / Easy avec l'échéance prévue sous chaque bouton. Après une relecture : Again / Hard seulement.
   - Erreur LLM : la restitution est déjà sauvegardée, [Relancer la correction].
4. Après la note : retour à l'accueil.

## Carnet d'erreurs (`/erreurs`)

Filtres matière / statut / type. Par erreur : description, fiche d'origine, récidives ; [Résolue] / [Rouvrir] / [Éditer] / [Supprimer].

## Régularité (`/regularite`)

Échéances, série, heatmap, alertes (IMPLEMENT_SCHEDULE.md).

## Réglages (`/reglages`)

Nouvelles fiches par jour, export JSON, modèle LLM configuré (lecture seule), déconnexion.
