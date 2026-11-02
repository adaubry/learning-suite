# FORMAT.md — v2 : format des fiches

> **Statut** : v2.0 (2026-11-02). Remplace la convention v1 (cours bruts, gras = important, italique = commentaire), qui ne s'applique plus.
> Les fiches sont produites en amont, hors de l'app (skill « fiches-revision-droit »). L'app les importe telles quelles. Ce document dit ce que le parseur attend et ce qu'il en fait.

## 1. Un set de fiches = un document

- Un document Google Docs (ou Claude Docs) contient un **set** de fiches numérotées, par exemple « Semaine 1 ADMIN ».
- Import : **Fichier → Télécharger → Markdown**, puis dépôt du `.md` ou collage du texte dans l'écran d'import.
- Pas de titre 1 attendu. Un éventuel titre 1 ou du texte avant la première fiche est ignoré (signalé à l'import).

## 2. Une fiche

```markdown
## 3. La loi des 16 et 24 août 1790

Pour briser la résistance des tribunaux, la Constituante interdit aux juges … ← thèse

- **Texte :** art. 13 : « Les fonctions judiciaires sont distinctes … »

### L'impact judiciaire

- **Cause :** la résistance des parlements (fiche 2) …
- **Conséquence :** ils ne peuvent plus intervenir dans les affaires administratives …
- **Piège :** les parlements sont des cours de justice, pas des juridictions administratives.
- **Complément (hors cours) :** …
```

- **Titre 2 = une fiche.** Le numéro fait partie du texte (`## 3. Titre`, `## **3\. Titre**` à l'export Google : accepté). Sans numéro, la position dans le document en tient lieu.
- **Titre 2 vide** (`## ` seul) : c'est le paragraphe qui porte le saut de page entre deux fiches (une fiche = une page) ; Google Docs l'exporte avec le style Titre 2 mais sans texte. Il clôt la fiche précédente sans en ouvrir une.
- **Titre 3 = sous-partie** de la fiche. Il donne son contexte aux points qui suivent.
- **Thèse** : le premier paragraphe non étiqueté qui suit le titre 2.
- **Étiquettes** : un paragraphe ou une puce qui commence par un passage en gras terminé par « : » (`**Cause :**`). Étiquettes reconnues : Définition, Texte, Exemple, Piège, Constat, Cause, Conséquence, Nuance, Logique, Lien, Complément (hors cours). Le gras ne sert à rien d'autre.
- **Tableaux** (Markdown GFM) : chaque ligne est un point.
- **Italique** : texte ordinaire (termes latins, titres d'arrêts). Aucune sémantique.

## 3. Ce que l'app en fait

- Le corps de la fiche (tout ce qui suit le titre 2, jusqu'au titre 2 suivant) est stocké tel quel et affiché tel quel en lecture.
- Les **points de contrôle** de la correction en sont dérivés en code (ARCHITECTURE §6). Les « Complément (hors cours) » ne sont jamais exigés dans un blurting.
- Les commentaires Word/Google ne passent pas l'export Markdown : ils restent dans le document source.

## 4. Ré-import

Modifier une fiche, c'est la modifier dans le document source puis ré-importer le set. L'app apparie les fiches par titre puis par numéro et conserve l'historique de révision des fiches appariées (ARCHITECTURE §5).
