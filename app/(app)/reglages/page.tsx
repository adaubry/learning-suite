import { requireUserId } from "@/lib/auth";
import * as account from "@/services/account";
import { resolveModel, ENV_KEY_BY_APPEL, type AppelLLM } from "@/llm/models";
import { ReglagesForm } from "./reglages-ui";

// Réglages (USER_FLOW.md v2) : rythme, export, modèle LLM (lecture seule).

function readModel(appel: AppelLLM): string {
  try {
    return resolveModel(appel);
  } catch {
    return "(non configuré)";
  }
}

export default async function ReglagesPage() {
  const userId = await requireUserId();
  const config = await account.getPlannerConfig(userId);
  const modeles = (Object.keys(ENV_KEY_BY_APPEL) as AppelLLM[]).map((appel) => ({
    appel,
    modele: readModel(appel),
  }));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold">Réglages</h1>
      <ReglagesForm
        nouvellesParJour={config.nouvellesParJour}
        modeles={modeles}
      />
    </div>
  );
}
