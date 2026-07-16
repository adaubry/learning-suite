import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // ponytail: 5 fichiers de test tapent Postgres local en parallèle (chacun
    // son client) ; le nettoyage afterAll dépasse parfois les 10s par défaut
    // sous contention (WSL2 + Docker) — 20s, pas de retry en boucle.
    hookTimeout: 20000,
    // pool 'threads' (défaut) partage process.env entre fichiers via les worker_threads
    // Node : deux beforeEach concurrents qui réécrivent LLM_MODEL_TRANSCRIPTION se
    // marchent dessus, PromptLog se retrouve pollué sous le mauvais model (flake
    // constaté : transcribeAudio.canary.test.ts, 1 attendu / 3 reçus). 'forks' isole
    // process.env par processus OS réel.
    pool: "forks",
    // ponytail: 32 vCPUs mais ~7.7 Gio de RAM (WSL2) — sans plafond, Vitest
    // fork jusqu'à nproc processus Postgres d'un coup et sature la RAM.
    maxWorkers: 4,
  },
});
