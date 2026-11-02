# USER_FLOW.md — v2 : écrans

> **Statut** : v2.1 (2026-11-02). Fiches, cycle unique, auto-évaluation sans LLM. Règle transversale : chaque écran a un état vide.

## Accueil — la file du jour (`/`)

- Liste ordonnée : révisions dues, puis toutes les nouvelles fiches (ou le plafond du jour s'il est fixé dans Réglages), puis re-file. Chaque ligne : titre de la fiche, set, matière, badge (Révision — retard / Nouvelle / À repasser).
- Actions par ligne : [Commencer] → cycle ; monter / descendre / en tête ; [Reporter].
- Horizon 7/30 j sous la file.
- **Sans aucune fiche** : « Importer un premier set de fiches » → `/importer`.
- **File vide** : « Rien à faire aujourd'hui », prochaine échéance, et, si un plafond est fixé, [Avancer une fiche de demain].
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
3. **Comparaison** (auto-évaluation, aucun LLM) : à gauche ta restitution puis la liste des points de la fiche à cocher (badge « essentiel » / « raisonnement », lien « Au carnet d'erreurs » par point), puis tes erreurs déjà relevées sur cette fiche ; à droite la fiche complète. Bilan en direct : points, essentiels, raisonnement cochés.
   - Tentative 1 : [Relire puis refaire] et la notation, la relecture est mise en avant s'il manque un point essentiel.
   - Notation : Again / Hard / Good / Easy avec l'échéance prévue sous chaque bouton. Après une relecture, rappel du bilan de la 1ʳᵉ passe (à froid).
4. Après la note : retour à l'accueil.

## Carnet d'erreurs (`/erreurs`)

Filtres matière / statut / type. Par erreur : description, fiche d'origine, récidives ; [Résolue] / [Rouvrir] / [Éditer] / [Supprimer].

## Régularité (`/regularite`)

Échéances, série, heatmap, alertes (IMPLEMENT_SCHEDULE.md).

## Réglages (`/reglages`)

Plafond de nouvelles fiches par jour (optionnel, désactivé par défaut), export JSON, déconnexion.
