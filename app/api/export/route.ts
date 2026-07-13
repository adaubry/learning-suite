import { requireUserId } from "@/lib/auth";
import * as account from "@/services/account";

// Réglages P7 (Bloc 9.1, USER_FLOW P7 : « export des données (JSON) »). Route Handler plutôt
// qu'un Server Action : un téléchargement de fichier a besoin d'une vraie réponse HTTP
// (Content-Disposition), pas d'une réponse d'action React.

export async function GET() {
  const userId = await requireUserId();
  const data = await account.exportUserData(userId);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="learning-suite-export-${data.exportedAt.slice(0, 10)}.json"`,
    },
  });
}
