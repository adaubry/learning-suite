# TECH_MAPPING.md — v2 : stack et délégations

> **Statut** : v2.0 (2026-11-02). Doctrine inchangée : natif > librairie listée ici > maison. Une librairie absente de cette liste se propose à l'humain, elle ne s'installe pas.

| Besoin | Choix |
|---|---|
| Framework | Next.js 16 (App Router, Server Actions, `proxy.ts`), React 19, TypeScript strict |
| BDD / ORM | Postgres (Neon en prod, Docker en local) + Drizzle (`postgres` driver) |
| Auth | Better-Auth (magic link via Resend, Google OAuth) |
| Markdown | unified + remark-parse + **remark-gfm** (tableaux des fiches) + remark-frontmatter ; rendu maison depuis l'AST |
| Validation | zod |
| Répétition espacée | ts-fsrs (`enable_short_term: false`) |
| UI | Astryx (`@astryxdesign/core`), Tailwind 4, lucide-react |
| Distracteur | chess.js + react-chessboard (puzzles hors ligne, CHESS.md) |
| Hébergement | Vercel, fonctions en `fra1` (Francfort, `vercel.json`) au plus près de Neon `eu-central-1` |
| Tâches de fond | Route Handler `/api/cron` + Vercel Cron |
| Tests | Vitest (unitaires + services contre Postgres local), Playwright (e2e) |

## Dépendances retirées en v2

Tiptap (`@tiptap/*`) : plus d'édition de cours dans l'app, les fiches se modifient dans leur document source. `diff`/`@types/diff` : plus de diff de versions de chapitre.

## Journal

| Version | Date | Changement |
|---|---|---|
| 2.1 | 2026-11-02 | Retrait d'OpenRouter : plus aucun appel LLM (auto-évaluation). Voir DECISIONS.md. |
| 2.0 | 2026-11-02 | Réécriture v2 (fiches). Ajout de remark-gfm ; retrait de Tiptap et jsdiff. Voir DECISIONS.md. |
