# Spec — Puzzles d'échecs sur écran d'attente

Destiné à Claude Code. À lire en entier avant d'écrire du code.

## 1. Contexte

L'app impose un écran d'attente éphémère entre la phase de lecture passive et la phase de blurting. Sa fonction est **cognitive** : empêcher la répétition mentale du cours pour que le rappel qui suit puise en mémoire à long terme et non en mémoire de travail.

Le puzzle d'échecs est un **distracteur**, pas une feature. Il occupe. Il ne récompense pas, ne mesure pas, ne progresse pas.

## 2. Non-goals (contraintes dures)

Aucun de ces éléments ne doit exister dans le code, même en TODO, même derrière un flag :

- ❌ Rating, ELO, score, streak, compteur de puzzles résolus
- ❌ Chronomètre visible dans le composant puzzle
- ❌ Feedback d'erreur : pas de croix rouge, pas de son négatif, pas de flash, pas de case surlignée, pas de message
- ❌ Affichage de la solution
- ❌ Persistance inter-session (localStorage, DB, cookie)
- ❌ Difficulté adaptative
- ❌ Appel réseau au runtime (Lichess API ou autre)
- ❌ Stockfish / moteur d'analyse
- ❌ Lien vers Lichess ou Chess.com

Si une demande future entre en conflit avec cette liste, **s'arrêter et signaler** plutôt que d'implémenter.

## 3. Dépendances

```bash
npm i chess.js react-chessboard
```

Rien d'autre. `zstd` est un outil système utilisé une seule fois au build de la base — pas une dépendance du projet.

## 4. Étape 1 — Préparer la base de puzzles (one-shot, hors runtime)

Source : Lichess Open Database, licence CC0.

Script jetable, à exécuter une fois, à ne pas committer :

```
wget https://database.lichess.org/lichess_db_puzzle.csv.zst
zstd -d lichess_db_puzzle.csv.zst
```

Colonnes du CSV : `PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags`

**Filtre :**

| Critère           | Valeur    |
| ----------------- | --------- |
| `Themes` contient | `mateIn1` |
| `Rating`          | `< 800`   |
| `Popularity`      | `> 90`    |
| `NbPlays`         | `> 1000`  |

**Sortie :** `lib/gap-puzzles.json` — un tableau d'objets `{ fen, moves }` uniquement. Jeter toutes les autres colonnes : elles ne servent qu'au filtrage et n'ont aucune raison d'atteindre le bundle.

Plafonner à ~1500 entrées. Vérifier la taille finale : viser < 300 ko.

Supprimer le CSV après génération.

## 5. Étape 2 — Le composant

Fichier unique : `components/GapPuzzle.tsx`, `"use client"` en tête (drag & drop → DOM).

### Contrat

```ts
type GapPuzzleProps = {
  onReady?: () => void;
};
```

Le composant **n'a pas de timer**. Il ne connaît pas la durée de l'écran d'attente. Le parent le monte, le parent le démonte. C'est tout.

### Sémantique du format Lichess

Piège classique, à ne pas rater :

- `fen` = position **avant** le coup adverse
- `moves` = liste UCI séparée par des espaces
- `moves[0]` = le coup adverse à **appliquer immédiatement** ; la position résultante est celle à afficher au joueur
- `moves[1]` = la solution

Pour un `mateIn1`, on ne compare **pas** le coup joué à `moves[1]`. Lichess précise que plusieurs coups peuvent mater et que tout coup qui mate valide le puzzle. La validation correcte est donc `game.isCheckmate()`.

### Boucle

```
1. Tirer un puzzle au hasard dans le JSON (useMemo sur l'index, sinon
   re-render → puzzle différent à chaque frame)
2. new Chess(puzzle.fen) ; game.move(moves[0])
3. Afficher game.fen() sur le board, orientation = game.turn()
4. Sur coup utilisateur :
   - game.move({ from, to, promotion: 'q' })
       → null  : coup illégal, chess.js refuse tout seul. Ne rien faire.
                 La pièce revient à sa case. Silence.
   - isCheckmate() → true  : puzzle suivant (voir §6)
   - isCheckmate() → false : game.undo(). La pièce revient à sa case.
                             Silence. Aucun marquage.
5. Retour à 1
```

**Le `promotion: 'q'` n'est pas optionnel.** Certains mats en 1 sont des promotions ; sans ce paramètre chess.js refuse un coup correct et l'utilisateur se retrouve bloqué sur une position insoluble, sans comprendre pourquoi (puisqu'on n'affiche pas les erreurs).

### État React

- `useRef` pour l'instance `Chess` (mutable, ne déclenche pas de render)
- `useState(fen)` comme source de vérité pour le rendu
- `useState(puzzleIndex)` pour l'avancement
- Rien d'autre

## 6. Transition entre puzzles

Sur réussite : appliquer le coup, laisser la position matée visible ~400 ms, puis charger le puzzle suivant. Pas d'animation de célébration, pas de son de victoire, pas de transition élaborée. Un fondu court ou rien.

Sur échec : il n'y a pas de transition, parce qu'il n'y a pas d'échec. La pièce revient, l'utilisateur réessaie. La spec ne connaît pas la notion d'erreur.

## 7. Feedback autorisé

Un seul : le son du coup joué (léger, neutre, identique en réussite et en échec). C'est le seul retour sensoriel qui ne crée pas de boucle. Facultatif — l'omettre si ça ajoute une dépendance.

## 8. API chess.js — attention à la version

chess.js v1 est en camelCase : `isCheckmate()`, `isGameOver()`. Les exemples en `in_checkmate()` datent de la v0 et **ne compileront pas**. Se référer au README du paquet installé, jamais aux blogs ou à StackOverflow.

L'instance `Chess` est mutable : `setState(gameInstance)` ne déclenche aucun re-render. Toujours passer par le FEN.

## 9. Le parent

L'écran d'attente possède :

- le timer et sa durée
- le démontage du composant à expiration
- le log unique autorisé : **temps médian par puzzle**

Ce log n'est pas affiché à l'utilisateur. C'est un instrument de calibration : s'il descend vers 3-5 s, la difficulté est bien réglée ; s'il stagne au-dessus de 20-30 s, le filtre `Rating < 800` est trop haut et le distracteur consomme du contrôle exécutif au lieu d'en libérer.

## 10. Critères d'acceptation

- [ ] Aucun chiffre visible à l'écran hormis, éventuellement, le timer du parent
- [ ] Un coup faux et un coup illégal produisent exactement le même comportement visuel
- [ ] Fermer et rouvrir l'écran ne restaure aucun état
- [ ] `grep -ri "score\|streak\|rating\|elo\|correct\|wrong\|fail" components/GapPuzzle.tsx` ne renvoie rien
- [ ] Aucune requête réseau au runtime
- [ ] Un mat en 1 par promotion se résout correctement
- [ ] Le composant fait moins de 120 lignes
