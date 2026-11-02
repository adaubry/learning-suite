// L0 · models.ts (ARCHITECTURE.md v2 §7) — mapping appel → modèle OpenRouter, lu
// depuis l'env : pas de valeur par défaut devinée (le choix du modèle revient à l'humain).

export type AppelLLM = "correction_erreurs";

// Exporté : la zone technique des Réglages énumère les appels sans dupliquer la liste.
export const ENV_KEY_BY_APPEL: Record<AppelLLM, string> = {
  correction_erreurs: "LLM_MODEL_CORRECTION_ERREURS",
};

export function resolveModel(appel: AppelLLM): string {
  const envKey = ENV_KEY_BY_APPEL[appel];
  const model = process.env[envKey];
  if (!model) {
    throw new Error(`Modèle non configuré pour l'appel "${appel}" (variable d'env ${envKey} absente).`);
  }
  return model;
}
