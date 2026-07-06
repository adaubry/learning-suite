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
  },
});
