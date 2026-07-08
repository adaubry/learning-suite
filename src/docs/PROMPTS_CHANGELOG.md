# PROMPTS_CHANGELOG.md — Journal des versions de prompts

> Une entrée par version de fichier sous `/prompts`. Toute modification d'un prompt ⇒ nouvelle version (`.vN+1.md`) + entrée ici + `npm run evals` + verdict (AGENTS.md §2.4).

| Date | Fichier | Changement | Verdict |
| ---- | ------- | ---------- | ------- |
| 2026-07-06 | `rubrique.v1.md` | Version initiale (bloc 4.1). Non consignée ici au moment de sa création — ce fichier n'existait pas encore ; entrée ajoutée rétroactivement au moment où `PROMPTS_CHANGELOG.md` est créé (bloc 3.2), sans repasser les evals (aucun changement de contenu). | — (evals non exécutés, hors scope bloc 3.2) |
| 2026-07-07 | `sectionnement.v1.md` | Version initiale (bloc 3.2) : appel L1, sortie = sections par indices du plan (Titre 2, sinon Titre 1). | — (pas d'`evals/sectionnement/` : nécessite l'écran de tri du bloc 3.3 pour produire un découpage de référence validé par l'utilisateur) |
| 2026-07-08 | `correction_erreurs.v1.md` | Version initiale (bloc 5.1) : appel L3, sortie = diff par point (référencé par `point_index`, 1-based) + erreurs candidates (récidive par `recidive_index`) — pas de champ verdict, calculé en code (DECISIONS.md). | — (pas d'`evals/correction/` : nécessite de vrais blurtings, produits par un usage réel de l'app à partir du bloc 5.2/5.3, cf. CLAUDE.md §2 données réelles) |
