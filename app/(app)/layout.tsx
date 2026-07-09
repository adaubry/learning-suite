import { AppShell } from "@/components/app-shell";
import { requireUserId } from "@/lib/auth";
import * as session from "@/services/session";

// Bandeau de reprise (incident réel : pas d'accès simple à une session ouverte
// depuis un autre écran atteint par retour/accueil) — calculé ici, une fois
// pour tout le shell (app)/, plutôt que dupliqué par page.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await requireUserId();
  const openCycle = await session.findOpenCycle(userId);

  return <AppShell openCycle={openCycle}>{children}</AppShell>;
}
