import { existsSync } from "node:fs";

// ponytail: guard only, aucun prompt/L0 à évaluer pour l'instant.
// Upgrade: remplacer par le vrai runner (jeu d'or contre OpenRouter) quand
// prompts/*.vN.md et src/llm/client.ts existent.
if (!existsSync("prompts")) {
  console.log("evals: pas de prompts/ pour l'instant, rien à évaluer.");
  process.exit(0);
}

console.error("evals: prompts/ existe mais le runner n'est pas encore implémenté.");
process.exit(1);
