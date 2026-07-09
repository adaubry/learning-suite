import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import * as session from "@/services/session";

// Route Handler (pas de Server Action, TECH_MAPPING U19/U20 : Suspense/streaming
// natif via ReadableStream — un Server Action renvoie une seule réponse, jamais
// un flux, cf. node_modules/next/dist/docs/01-app/02-guides/server-actions.md
// « single-roundtrip response model »). Adaptateur mince (AGENTS §2) : auth,
// validation zod, appel d'UN point d'entrée S4 (L4 streamé), relais brut du
// texte — aucune logique métier. Erreur pendant le flux (cycle fermé, LLM en
// échec) ⇒ le flux s'interrompt, le client détecte l'erreur à la lecture et
// affiche son propre [Réessayer] (USER_FLOW règle 7) : pas de distinction fine
// par code HTTP une fois le flux entamé (StreamController n'expose que ça).

// "opening" sert aussi la reprise après [Refaire un Feynman] (beginRestartFeynman
// a déjà remis le cycle en état feynman ; openingTurn relit l'historique réel,
// non vide dans ce cas — session.ts, PLAN Bloc 7.2).
const bodySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("opening"), cycleId: z.string().min(1) }),
  z.object({ mode: z.literal("turn"), cycleId: z.string().min(1), transcript: z.string().min(1) }),
]);

export async function POST(request: Request) {
  const userId = await requireUserId();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return new Response(parsed.error.issues[0]?.message ?? "Requête invalide.", { status: 400 });
  }
  const input = parsed.data;

  const generator =
    input.mode === "opening"
      ? session.openingTurn(userId, input.cycleId)
      : session.feynmanTurn(userId, input.cycleId, input.transcript);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
