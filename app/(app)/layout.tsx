import { AppShell } from "@/components/app-shell";
import { requireUserId } from "@/lib/auth";
import * as session from "@/services/session";
import * as alertService from "@/services/alert";
import * as statsService from "@/services/stats";
import * as accountService from "@/services/account";
import { pickBannerAlert } from "@/core/planner/generateAlerts";

const TOAST_TYPES = new Set(["echeance_j7", "dette_reports", "pic_charge"]);

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Bandeau de reprise (incident réel : pas d'accès simple à une session ouverte
// depuis un autre écran atteint par retour/accueil) — calculé ici, une fois
// pour tout le shell (app)/, plutôt que dupliqué par page. `generateAlerts` à
// chaque chargement de l'app (IMPLEMENT_SCHEDULE.md §5 — mono-utilisateur,
// suffit sans cron) ; bannière + toasts actionnables + timer serie_en_peril
// (§6) sont tous alimentés ici, globalement, jamais par un écran particulier.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await requireUserId();
  const today = todayIso();

  const [openCycle] = await Promise.all([session.findOpenCycle(userId), alertService.generateAlerts(userId)]);
  const [visibleAlerts, streak, config, sessionsTodayMap] = await Promise.all([
    alertService.listVisible(today),
    statsService.streak(userId, today),
    accountService.getPlannerConfig(userId),
    statsService.sessionCountsByDay(userId, today, today),
  ]);

  const bannerAlert = pickBannerAlert(visibleAlerts);
  const toastAlerts = visibleAlerts.filter((a) => TOAST_TYPES.has(a.type));

  return (
    <AppShell
      openCycle={openCycle}
      bannerAlert={bannerAlert}
      toastAlerts={toastAlerts}
      streak={streak.streak}
      sessionsToday={sessionsTodayMap[today] ?? 0}
      heureAlerteSerie={config.heureAlerteSerie}
      gelsSerieRestants={config.gelsSerieRestants}
    >
      {children}
    </AppShell>
  );
}
