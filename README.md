# Learning Suite

Webapp personnelle de révision du droit, autour de **fiches** : chaque fiche importée devient une carte de répétition espacée (FSRS), révisée par blurting (rappel écrit sans la fiche), corrigée par un LLM contre les points de la fiche, puis notée par l'étudiant.

Documentation : `src/docs/` (ARCHITECTURE, FORMAT, USER_FLOW, TECH_MAPPING, DECISIONS). Contrat des agents de code : `AGENTS.md`.

## Démarrer en local

Prérequis : Node 20+, Docker.

```bash
docker compose up -d        # Postgres local sur le port 5433
cp .env.example .env.local  # puis remplir les secrets (OpenRouter, Better-Auth…)
npm install
npm run db:migrate
npm run dev                 # http://localhost:3000
```

`.env.local` doit pointer sur la base Docker : les tests écrivent et suppriment des lignes.

## Importer des fiches

Dans Google Docs : **Fichier → Télécharger → Markdown**, puis écran **Importer** de l'app. Format attendu : `src/docs/FORMAT.md` (un titre 2 numéroté par fiche).

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run check` | typecheck + lint + tests Vitest |
| `npm run test:canary` | canaris Vitest + Playwright |
| `npm run check:full` | check + toute la suite Playwright |
| `npm run db:generate` / `db:migrate` / `db:studio` | migrations Drizzle |
