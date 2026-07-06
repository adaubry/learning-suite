# DECISIONS.md — Journal des arbitrages pris en cours de route

> Complète ARCHITECTURE.md §11 (ADR fondateurs, actés avant implémentation). Ce fichier consigne les décisions prises **pendant** le développement : déviations, arbitrages ambigus tranchés avec l'humain, écarts par rapport à un document existant (AGENTS.md §1). Une ligne par décision, ordre chronologique, jamais réécrite rétroactivement.

| Date | Bloc / contexte | Décision | Raison | Alternative rejetée |
| ---- | ---------------- | -------- | ------ | -------------------- |
| 2026-07-06 | Outillage tests (hors bloc) | `evals/` (racine) déplacé vers `e2e/evals/` ; artefacts Playwright (`test-results/`, `playwright-report/`) sortent aussi sous `e2e/`. ADR 16 (ARCHITECTURE.md v0.4). | Un seul dossier pour tout ce qui touche aux tests e2e/ia, sans confusion avec les tests unitaires colocalisés dans `src/` ; les deux workflows (Playwright vs evals LLM) ne s'interfèrent pas nativement — `evals/run.mjs` ne matche pas le pattern `*.spec.ts` de Playwright. | `src/evals/` (abandonné par le plan) ; `evals/` séparé à la racine |
