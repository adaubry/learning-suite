"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { signOut } from "../../app/(auth)/actions";
import type { OpenCycleInfo } from "@/services/session";

// U1 AppShell minimal (FUNCTIONS §6.1) : Réglages n'est pas encore construit
// (bloc à venir) — item désactivé plutôt que retiré, pour respecter la
// navigation permanente de USER_FLOW. Erreurs activé (Bloc 5.3, U24).

const NAV_ITEMS = [
  { href: "/", label: "Aujourd'hui", enabled: true },
  { href: "/curriculum", label: "Curriculum", enabled: true },
  { href: "/erreurs", label: "Erreurs", enabled: true },
  { href: "/reglages", label: "Réglages", enabled: false },
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
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="px-3 py-2 text-sm font-semibold">
          Learning Suite
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map((item) =>
                  item.enabled ? (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={pathname === item.href}
                        render={<Link href={item.href} />}
                      >
                        {item.label}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton disabled>{item.label}</SidebarMenuButton>
                    </SidebarMenuItem>
                  ),
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <form action={signOut}>
            <SidebarMenuButton type="submit">
              <LogOut />
              Se déconnecter
            </SidebarMenuButton>
          </form>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 items-center border-b px-3">
          <SidebarTrigger />
        </header>
        {openCycle && resumeHref && (
          <div className="flex flex-wrap items-center gap-3 border-b bg-amber-50 px-4 py-2 text-sm dark:bg-amber-950">
            <span>
              Session en cours sur <strong>{openCycle.sectionTitre}</strong> — termine-la ou abandonne-la avant d&apos;en commencer une autre.
            </span>
            <Link href={resumeHref} className="ml-auto shrink-0 font-medium underline">
              Reprendre la session
            </Link>
          </div>
        )}
        <div className="flex-1 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
