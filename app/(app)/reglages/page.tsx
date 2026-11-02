import { requireUserId } from "@/lib/auth";
import * as account from "@/services/account";
import { ReglagesForm } from "./reglages-ui";

// Réglages (USER_FLOW.md v2) : rythme, export.

export default async function ReglagesPage() {
  const userId = await requireUserId();
  const config = await account.getPlannerConfig(userId);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold">Réglages</h1>
      <ReglagesForm
        nouvellesParJour={config.nouvellesParJour}
      />
    </div>
  );
}
