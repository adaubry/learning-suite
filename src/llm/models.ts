// L0 · models.ts (FUNCTIONS §2, TECH_MAPPING §2) — mapping appel → modèle OpenRouter,
// configurable sans toucher au code. Un modèle par appel, lu depuis l'env : pas de
// valeur par défaut devinée (le choix du modèle revient à l'humain, pas à un guess).

export type AppelLLM = "sectionnement" | "rubrique" | "correction_erreurs" | "feynman" | "transcription";

const ENV_KEY_BY_APPEL: Record<AppelLLM, string> = {
  sectionnement: "LLM_MODEL_SECTIONNEMENT",
  rubrique: "LLM_MODEL_RUBRIQUE",
  correction_erreurs: "LLM_MODEL_CORRECTION_ERREURS",
  feynman: "LLM_MODEL_FEYNMAN",
  transcription: "LLM_MODEL_TRANSCRIPTION",
};

export function resolveModel(appel: AppelLLM): string {
  const envKey = ENV_KEY_BY_APPEL[appel];
  const model = process.env[envKey];
  if (!model) {
    throw new Error(`Modèle non configuré pour l'appel "${appel}" (variable d'env ${envKey} absente).`);
  }
  return model;
}
