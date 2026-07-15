# Spec — Extension du composant GapPuzzle

Prérequis : `GAP_PUZZLE_SPEC.md` implémenté et fonctionnel. Les non-goals du §2 de la spec de base **restent en vigueur intégralement**. Ce document ajoute trois choses ; il n'en retire aucune.

## 0. Ce qui est refusé dans cette extension

**Le son de défaite n'est pas implémenté.** Motif : il n'existe aucun événement auquel l'attacher. La spec de base ne connaît pas la notion d'échec — un coup faux et un coup illégal produisent le même comportement (`undo()`, silence). Ajouter un son de défaite oblige à recréer un état d'échec, donc à réintroduire la boucle échec → revanche et la position ratée qui reste en tête pendant le blurting.

Trois sons sont implémentés, pas quatre. Voir §3.

---

## 1. Indicateur de trait

Trivial et aligné : c'est de l'information sur la position, pas du feedback sur la performance.

Après `game.move(moves[0])`, `game.turn()` renvoie la couleur du joueur pour toute la durée du puzzle. Valeur stable, à calculer une fois au chargement du puzzle.

```
'w' → « Trait aux blancs »
'b' → « Trait aux noirs »
```

Placement : hors du board, au-dessus ou en dessous. Texte discret, même famille typographique que le reste de l'écran d'attente. Pas d'icône colorée clignotante.

L'orientation du board est déjà `game.turn()` — l'indicateur est redondant sur le plan logique mais pas sur le plan perceptif, et cet écran est précisément conçu pour un utilisateur à faible attention. Garder les deux.

---

## 2. Click-to-move et cases légales

### Pourquoi c'est aligné avec la spec

Afficher les cases légales transforme « quels coups cette pièce peut-elle jouer » d'une tâche de recherche mentale en une tâche perceptive. C'est exactement la direction voulue par la spec de base : moins de contrôle exécutif, plus de perception. Ce n'est pas une concession, c'est une amélioration.

Ça ne révèle rien : sur un `mateIn1`, voir les cases légales d'une pièce ne dit pas laquelle mate.

### État à ajouter

```ts
const [selected, setSelected] = useState<Square | null>(null);
```

Un seul nouveau state. Rien d'autre.

### Machine à états

| Événement         | Condition                                                            | Action                                                  |
| ----------------- | -------------------------------------------------------------------- | ------------------------------------------------------- |
| Clic sur case     | `selected === null` et la case contient une pièce du joueur          | `setSelected(square)`                                   |
| Clic sur case     | `selected === null` et case vide ou pièce adverse                    | rien                                                    |
| Clic sur case     | `square === selected`                                                | `setSelected(null)` (désélection)                       |
| Clic sur case     | `selected !== null`, coup légal                                      | jouer le coup, `setSelected(null)`, cf. §5 spec de base |
| Clic sur case     | `selected !== null`, coup illégal, case contient une pièce du joueur | `setSelected(square)` (re-sélection)                    |
| Clic sur case     | `selected !== null`, coup illégal, autre                             | `setSelected(null)`. Silence.                           |
| **Début de drag** | toujours                                                             | `setSelected(null)`                                     |
| Drop              | —                                                                    | comportement inchangé (§5 spec de base)                 |

La ligne en gras est la contrainte explicite : **les cases légales apparaissent au clic, jamais pendant le drag.** Le handler de début de drag ne fait que vider la sélection.

### Calcul des cases légales

```ts
game.moves({ square: selected, verbose: true }).map((m) => m.to);
```

Recalculé à chaque render quand `selected` change. Ne pas mémoïser : c'est quelques microsecondes.

### Rendu des marqueurs

Deux styles distincts, convention Lichess :

- **case vide** → petit disque centré
  `radial-gradient(circle, rgba(0,0,0,.14) 20%, transparent 22%)`
- **case occupée (capture)** → anneau sur le bord
  `radial-gradient(circle, transparent 78%, rgba(0,0,0,.14) 80%)`

Distinguer les deux : c'est de l'information sur la position, gratuite en charge cognitive.

Ajouter aussi un fond léger sur la case sélectionnée elle-même.

Vérifier le contraste en dark mode — `rgba(0,0,0,...)` disparaît sur un board sombre. Prévoir les deux variantes.

### Promotion

Le piège `promotion: 'q'` du §5 de la spec de base s'applique **aussi** au chemin click-to-move. Le coup passe par le même helper. Si tu écris deux appels à `game.move()`, c'est déjà une erreur — factorise en une seule fonction `tryMove(from, to)` appelée par le clic et par le drop.

---

## 3. Feedback audio

### Les trois sons

| Événement | Détection                                        | Caractère                                     |
| --------- | ------------------------------------------------ | --------------------------------------------- |
| Coup joué | `move !== null` et `move.captured === undefined` | clic sec, neutre                              |
| Capture   | `move.captured !== undefined`                    | plus mat, légèrement plus grave               |
| Mat       | `game.isCheckmate()`                             | **transition, pas fanfare** — voir ci-dessous |

Le son de mat est **fonctionnel** : il signale que le board va changer (§6 spec de base : position matée visible ~400 ms puis puzzle suivant). Sans lui, le changement de position est inexpliqué. Ce n'est pas une récompense.

Contrainte : **même volume et même famille sonore que le son de coup.** Pas d'accord majeur ascendant, pas de fanfare, pas de son plus long. Si en l'écoutant tu as envie de rejouer pour le réentendre, il est raté — refais-le.

Coup faux → aucun son supplémentaire. Le son de coup ne se déclenche pas, puisqu'on `undo()`. Silence total. C'est voulu.

### Implémentation : Web Audio, pas de fichiers

Zéro asset, zéro fetch, zéro problème de licence, zéro dépendance. Trois oscillateurs courts avec enveloppe, dans un module `lib/gap-sounds.ts` :

```ts
let ctx: AudioContext | null = null;

function blip(freq: number, dur: number, type: OscillatorType = "sine") {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + dur);
}

export const sfx = {
  move: () => blip(440, 0.06, "triangle"),
  capture: () => blip(220, 0.09, "triangle"),
  mate: () => blip(330, 0.12, "triangle"),
};
```

Valeurs à ajuster à l'oreille. Le point est la structure, pas les fréquences.

### Politique d'autoplay — le vrai piège

Un `AudioContext` créé au montage démarre en état `suspended` : **le premier son ne sortira pas** et il n'y aura aucune erreur.

Correctif : créer ou reprendre le contexte au premier geste utilisateur.

```ts
export function initAudio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
}
```

Appeler `initAudio()` en tête du premier `onSquareClick` / `onPieceDragBegin`. Idempotent, coût nul.

### Alternative si les sons synthétiques déplaisent

Fichiers `.ogg` CC0 dans `public/`, préchargés au montage. **Ne pas récupérer les sons de Lichess** sans vérifier leur licence individuellement : le code de Lichess est AGPL, les assets audio ont leurs propres licences, et « c'est open source » ne suffit pas.

---

## 4. Le piège de version — à lire avant d'écrire une ligne

**react-chessboard est en v5 et l'API a changé.** La v5 expose une prop unique `options` :

```jsx
<Chessboard options={chessboardOptions} />
```

Toute la documentation, tous les blogs, toutes les réponses StackOverflow et la quasi-totalité des repos GitHub utilisent l'API v4 en props séparées (`position`, `onPieceDrop`, `onSquareClick`, `customSquareStyles`, `boardOrientation`, `arePiecesDraggable`). **Ce code ne compilera pas.**

Les noms exacts des clés de `options` en v5 ne sont pas assumés dans cette spec. Procédure obligatoire avant d'implémenter :

1. `cat node_modules/react-chessboard/package.json | grep version`
2. Lire `node_modules/react-chessboard/dist/index.d.ts` — les types sont la source de vérité
3. En cas de doute : https://react-chessboard.vercel.app/ (Storybook officiel)

La logique de cette spec (machine à états, calcul des cases légales, styles de marqueurs) est indépendante de la version. Seul le câblage change.

Rappel connexe : chess.js v1 est en camelCase (`isCheckmate()`), les exemples en `in_checkmate()` sont de la v0.

---

## 5. Critères d'acceptation

- [ ] Le trait est affiché et correct sur 10 puzzles consécutifs, blancs et noirs
- [ ] Cliquer une pièce affiche ses cases légales ; disques sur cases vides, anneaux sur captures
- [ ] **Drag une pièce n'affiche aucune case légale**
- [ ] Re-cliquer la pièce sélectionnée la désélectionne
- [ ] Cliquer une autre pièce du joueur re-sélectionne sans coup intermédiaire
- [ ] Le clic et le drag passent par le même `tryMove()` — un seul appel à `game.move()` dans le fichier
- [ ] Un mat en 1 par promotion se résout **par clic** comme par drag
- [ ] Le premier son du premier puzzle après un rechargement de page est audible
- [ ] Un coup faux ne produit aucun son
- [ ] Les trois sons ont le même volume perçu ; aucun ne donne envie d'être réentendu
- [ ] Les marqueurs de cases légales sont visibles en light et en dark mode
- [ ] `grep -ri "defeat\|lose\|lost\|error\|fail\|victory\|win" components/GapPuzzle.tsx lib/gap-sounds.ts` ne renvoie rien
- [ ] Le composant reste sous 200 lignes
