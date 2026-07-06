# FORMAT.md — Convention de formatage des cours

> **Statut** : v0.3
> **Rôle** : document fondateur. Le parseur, les prompts et l'interface d'import dépendent tous de cette convention. Toute modification incrémente la version de la convention et peut invalider les rubriques existantes.
> **Calibrée sur données réelles** : chapitre « Introduction — droit des obligations » (61 Ko, titres jusqu'au niveau 5, 73 segments gras dont 12 paragraphes entiers, 1 paragraphe italique entier, listes à puces).

---

## 1. Principes

1. **Le format canonique interne est du Markdown** (stockage et échange). Les cours vivent dans Google Docs ; l'édition dans l'app passe par le WYSIWYG Tiptap sérialisé vers ce format.
2. **Le parseur est du code déterministe (règles sur l'AST remark), jamais un LLM.**
3. **Séparation des deux voix du document** : le **cours** (source de vérité des corrections) et les **commentaires de l'étudiant** (contexte, jamais source de vérité).
4. **Minimalisme.** Trois constructions porteuses de sens (titres, gras, italique) + une règle de groupement. Tout le reste est du texte ordinaire. Le pilotage fin (sectionnement, importance, découpage) se fait dans l'application, pas dans le texte.

---

## 2. La convention

### 2.1 Hiérarchie des titres — Titres 1 à 6

| Google Docs | Canonique      | Sémantique                          |
| ----------- | -------------- | ----------------------------------- |
| Titre 1     | `# Titre`      | Titre du chapitre / grande division |
| Titre 2     | `## Titre`     | Grande partie                       |
| Titre 3     | `### Titre`    | Section                             |
| Titre 4     | `#### Titre`   | Sous-section                        |
| Titre 5     | `##### Titre`  | Paragraphe (§)                      |
| Titre 6     | `###### Titre` | Subdivision fine                    |

- Les titres ont **une seule fonction** : permettre à l'IA de comprendre le plan du cours. Aucun niveau ne déclenche de comportement spécial.
- La hiérarchie doit être **strictement descendante** (pas de saut de niveau vers le bas : un `####` directement sous un `##` est une anomalie). Le parseur signale, ne corrige pas.
- Le sectionnement en cibles d'étude est proposé par l'IA à partir du plan complet (niveaux 1–6), puis entièrement ajustable en phase de tri (regrouper, scinder, renommer, pondérer).

### 2.2 Gras = important

| Google Docs | Canonique   | Sémantique pour l'IA                                                               |
| ----------- | ----------- | ---------------------------------------------------------------------------------- |
| **Gras**    | `**texte**` | Élément **important** du cours → candidat prioritaire de la rubrique de correction |

Le gras peut être inline (quelques mots) ou couvrir un ou plusieurs paragraphes entiers (voir la règle de groupement §2.4).

### 2.3 Italique = commentaire de l'étudiant

| Google Docs | Canonique | Sémantique pour l'IA                                                    |
| ----------- | --------- | ----------------------------------------------------------------------- |
| _Italique_  | `*texte*` | **Commentaire personnel de l'étudiant**, inline ou en paragraphe entier |

Traitement :

- ❌ **Exclu de la source de vérité** : jamais utilisé pour juger un blurting (l'étudiant peut se tromper dans ses notes).
- ✅ **Contexte secondaire** du générateur de rubriques et du questionneur Feynman (révèle les difficultés personnelles).
- ✅ Affiché visuellement distinct dans l'app.

### 2.4 Règle de groupement des paragraphes emphasés (NOUVEAU)

S'applique aux paragraphes **entièrement** gras ou **entièrement** italiques, consécutifs et de même type :

- **Une seule ligne vide entre eux** (la séparation normale de paragraphes, `\n\n`) ⇒ ils forment **UN SEUL segment** (un même bloc important, ou un même commentaire multi-paragraphes).
- **Au moins deux lignes vides** (dans Google Docs : un paragraphe vide entre les deux) ⇒ **segments indépendants**.

```markdown
**Premier paragraphe important.**

**Suite du même point important.** ← 1 ligne vide : MÊME segment

**Point important distinct.** ← 2 lignes vides : segment INDÉPENDANT
```

- La règle ne concerne pas le gras/italique **inline** (chaque segment inline reste indépendant) ni deux paragraphes de types différents (gras puis italique = toujours indépendants).
- Portée : le découpage des **segments** transmis au générateur de rubriques (un segment = un candidat point de contrôle) et l'affichage (un bloc visuel).

### 2.5 Cas dégénéré : gras + italique

`***texte***` est ambigu (important ou commentaire ?). **Signalé au rapport de validation**, traité par défaut comme du gras. À nettoyer dans le source. (Le WYSIWYG de l'app en interdit la saisie ; le cas ne peut venir que de l'import.)

### 2.6 Contenu ordinaire toléré

Constaté dans les exports réels et accepté tel quel, **sans sémantique** :

- **Listes à puces et numérotées** : contenu ordinaire du cours. ⚠️ Le marqueur de liste `*` n'est PAS un italique — la distinction est portée par l'AST remark (nœud `list` vs `emphasis`), jamais par une regex. Un item de liste peut lui-même contenir du gras ou de l'italique, avec leur sémantique normale.
- **Citations entre guillemets, tableaux Markdown** : transmis tels quels.
- Les **images** sont ignorées (signalées au rapport d'import) ; les **notes de bas de page** sont converties en texte entre parenthèses.

---

## 3. Chaîne d'import (Google Docs → format canonique)

L'export Markdown natif suffit (`Fichier → Télécharger → Markdown`) : titres 1–6, gras, italique et listes y sont préservés.

| Voie             | Chemin                                                | Usage                                            |
| ---------------- | ----------------------------------------------------- | ------------------------------------------------ |
| **A (standard)** | Export Markdown natif → upload ou collage             | Import normal                                    |
| **B (secours)**  | Export `.docx` → conversion intégrée (mammoth/pandoc) | Si l'export natif produit un Markdown défectueux |

Après import : affichage du document converti + rapport de validation, **relecture et validation avant enregistrement**. Conversion assistée, jamais aveugle.

## 4. Métadonnées de chapitre (front matter)

Bloc YAML **entièrement généré et géré par la webapp** (jamais écrit à la main) :

```yaml
---
matiere: Droit civil
chapitre: "Introduction au droit des obligations"
semestre: S3
version: 1
maj: 2026-07-06
---
```

Lecture du bloc à l'import via `remark-frontmatter` (écosystème unified — DECISIONS.md).

## 5. Cycle de vie et versionnage du cours

1. **Toute sauvegarde modifiante incrémente `version`** (hash P3 : pas d'incrément si contenu inchangé, normalisation fins de ligne/espaces).
2. **L'incrément invalide en cascade** (ARCHITECTURE §7) : rubriques des sections touchées → `obsolete` ; re-sectionnement si le plan a changé (appariement P4, historique préservé pour les sections intactes).
3. Les sessions et erreurs passées portent leur `chapter_version` d'origine — jamais modifiées.
4. Deux canaux de mise à jour : **ré-import Google Docs** (canal principal, diff + conséquences) et **éditeur WYSIWYG intégré** (retouches rapides, bandeau de rappel).

## 6. Règles de parsing (contrat du parseur — P1/P2 sur AST remark)

Sorties garanties pour chaque chapitre :

1. L'**arbre des titres** (niveaux 1–6) fidèle, avec bornes de chaque nœud.
2. Les **segments gras** avec positions, **après application de la règle de groupement §2.4** (les paragraphes gras consécutifs à une ligne vide sont fusionnés en un segment).
3. Les **segments italiques** (commentaires) avec ancrage, mêmes règles de groupement, **retirés de la source de vérité**.
4. Un **rapport de validation** : hiérarchie non descendante (tout saut de niveau, sur 1–6), gras+italique, Markdown mal formé.
5. **Réversibilité sémantique** : source re-parsée ≡ (contenu + commentaires réinjectés) re-parsé — l'égalité se vérifie sur l'AST ou le hash normalisé, pas byte à byte (remark-stringify normalise la syntaxe).

Le parseur ne corrige jamais : toute anomalie est montrée à l'utilisateur.

## 7. Exemple valide (extrait calqué sur le chapitre réel)

```markdown
# Introduction

## Présentation

La première partie sera consacrée au contrat. Mais ensuite, **le code va
réglementer certains contrats particuliers, appelés les contrats spéciaux**.

### Les sources de l'obligation

**L'article 1100 alinéa 1er identifie trois sources différentes
d'obligations : les actes juridiques, les faits juridiques et la loi.**

**L'alinéa 2 mentionne également les obligations naturelles.**

**La créance figure à l'actif du patrimoine, la dette au passif.**

_à revoir : j'ai confondu obligation naturelle et obligation civile au TD 2_

Exemples d'application :

- En droit des assurances ;
- La théorie de la concurrence déloyale (application de la responsabilité
  pour faute) ;
- Dans le code de la route : l'obligation de rouler à droite.
```

Lecture : les deux premiers paragraphes gras (une ligne vide) = **un seul segment important** ; le troisième (deux lignes vides) = **segment indépendant** ; l'italique = commentaire hors source de vérité ; les puces = contenu ordinaire, leurs `*` ne sont pas des italiques.

### Exemples invalides (signalés)

```markdown
#### Sous-section orpheline ← Titre 4 directement sous un Titre 2 : signalé

Un élément **_gras et italique_** ← ambigu : signalé, traité comme gras
```

## 8. Ce que la convention ne couvre pas

Tout le reste, point final. Tout ce qui n'est pas §2.1–§2.4 est du texte ordinaire transmis tel quel (§2.6). Aucune extension sans réviser ce document.

## 9. Journal des versions de la convention

| Version | Date       | Changement                                                                                                                                                                                                                                                                                                                                     |
| ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | 2026-07-02 | Création — 5 constructions, import docx                                                                                                                                                                                                                                                                                                        |
| 0.2     | 2026-07-02 | Simplification : 3 constructions ; gras = important, italique = commentaire                                                                                                                                                                                                                                                                    |
| 0.3     | 2026-07-06 | Calibrage sur chapitre réel : **titres 1–6** (constaté jusqu'au niveau 5) ; **règle de groupement des paragraphes emphasés consécutifs** (1 ligne vide = même segment, ≥ 2 = indépendants) ; listes à puces = contenu ordinaire (marqueur `*` ≠ italique, distinction par AST) ; critère de réversibilité précisé (AST/hash, pas byte à byte). |
