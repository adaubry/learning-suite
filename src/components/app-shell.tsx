"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { AppShell as AstryxAppShell } from "@astryxdesign/core/AppShell";
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
} from "@astryxdesign/core/SideNav";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { signOut } from "../../app/(auth)/actions";
import type { OpenCycleInfo } from "@/services/session";
import type { alert as alertTable } from "@/db/schema";
import { ToastBridge } from "./toast-host";
import { AlertBanner } from "./alert-banner";
import { ToastAlerts } from "./toast-alerts";
import { SerieEnPerilTimer } from "./serie-en-peril-timer";

// U1 AppShell minimal (FUNCTIONS §6.1) — navigation permanente de USER_FLOW.
// Migré vers Astryx (DECISIONS.md 2026-07-13) : premier écran/surface converti.

const NAV_ITEMS = [
  { href: "/", label: "Aujourd'hui", enabled: true },
  { href: "/curriculum", label: "Curriculum", enabled: true },
  { href: "/regularite", label: "Régularité", enabled: true },
  { href: "/erreurs", label: "Erreurs", enabled: true },
  { href: "/reglages", label: "Réglages", enabled: true },
] as const;

type Alert = typeof alertTable.$inferSelect;

export function AppShell({
  children,
  openCycle,
  bannerAlert = null,
  toastAlerts = [],
  streak = 0,
  sessionsToday = 0,
  heureAlerteSerie = "20:00",
  gelsSerieRestants = 0,
}: {
  children: React.ReactNode;
  /** Session ouverte ailleurs (incident réel : pas d'accès simple pour y revenir
   *  depuis un écran atteint par retour/accueil) — bandeau visible sur tout le
   *  shell (app)/ tant qu'elle reste ouverte. */
  openCycle: OpenCycleInfo | null;
  /** Alerte la plus urgente à bannière (P13.pickBannerAlert), IMPLEMENT_SCHEDULE.md §6 —
   *  rendue par le layout, jamais par l'écran. */
  bannerAlert?: Alert | null;
  /** Alertes visibles routées vers le canal toast (§6) : echeance_j7/dette_reports/pic_charge. */
  toastAlerts?: Alert[];
  streak?: number;
  sessionsToday?: number;
  heureAlerteSerie?: string;
  gelsSerieRestants?: number;
}) {
  const pathname = usePathname();
  // Fusion Machine B/C (2026-07-15) : un seul écran désormais, quel que soit
  // `openCycle.type` (label cosmétique — étude/révision partagent la même route).
  const resumeHref = openCycle ? `/etude/${openCycle.sectionId}` : null;
  const hasBanner = Boolean(openCycle && resumeHref) || Boolean(bannerAlert);

  return (
    <AstryxAppShell
      contentPadding={6}
      banner={
        hasBanner ? (
          <>
            {openCycle && resumeHref ? (
              <Banner
                status="info"
                title="Session en cours"
                description={`${openCycle.sectionTitre} — reprends-la ou abandonne-la avant d'en commencer une autre.`}
                endContent={
                  <Link
                    href={resumeHref}
                    className="font-medium underline whitespace-nowrap"
                  >
                    Reprendre la session
                  </Link>
                }
              />
            ) : null}
            <AlertBanner alert={bannerAlert} />
          </>
        ) : undefined
      }
      sideNav={
        <SideNav
          header={<SideNavHeading heading="Learning Suite" />}
          footer={
            <form action={signOut}>
              <Button
                type="submit"
                variant="ghost"
                label="Se déconnecter"
                icon={<LogOut size={16} />}
              />
            </form>
          }
        >
          {NAV_ITEMS.map((item) => (
            <SideNavItem
              key={item.href}
              as={Link}
              href={item.href}
              label={item.label}
              isSelected={pathname === item.href}
              isDisabled={!item.enabled}
            />
          ))}
        </SideNav>
      }
    >
      <ToastBridge />
      <ToastAlerts alerts={toastAlerts} gelsSerieRestants={gelsSerieRestants} />
      <SerieEnPerilTimer streak={streak} sessionsToday={sessionsToday} heureAlerteSerie={heureAlerteSerie} gelsSerieRestants={gelsSerieRestants} />
      {children}
    </AstryxAppShell>
  );
}
