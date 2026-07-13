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

// U1 AppShell minimal (FUNCTIONS §6.1) — navigation permanente de USER_FLOW.
// Migré vers Astryx (DECISIONS.md 2026-07-13) : premier écran/surface converti.

const NAV_ITEMS = [
  { href: "/", label: "Aujourd'hui", enabled: true },
  { href: "/curriculum", label: "Curriculum", enabled: true },
  { href: "/erreurs", label: "Erreurs", enabled: true },
  { href: "/reglages", label: "Réglages", enabled: true },
] as const;

export function AppShell({
  children,
  openCycle,
}: {
  children: React.ReactNode;
  /** Session ouverte ailleurs (incident réel : pas d'accès simple pour y revenir
   *  depuis un écran atteint par retour/accueil) — bandeau visible sur tout le
   *  shell (app)/ tant qu'elle reste ouverte. */
  openCycle: OpenCycleInfo | null;
}) {
  const pathname = usePathname();
  const resumeHref = openCycle
    ? openCycle.type === "etude"
      ? `/etude/${openCycle.sectionId}`
      : `/revision/${openCycle.sectionId}`
    : null;

  return (
    <AstryxAppShell
      contentPadding={6}
      banner={
        openCycle && resumeHref ? (
          <Banner
            status="warning"
            title="Session en cours"
            description={`${openCycle.sectionTitre} — termine-la ou abandonne-la avant d'en commencer une autre.`}
            endContent={
              <Link href={resumeHref} className="font-medium underline whitespace-nowrap">
                Reprendre la session
              </Link>
            }
          />
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
      {children}
    </AstryxAppShell>
  );
}
