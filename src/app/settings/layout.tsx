"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarIcon, TvIcon, WaypointsIcon } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { PortalHopWordmark } from "@/components/portal-hop-wordmark";
import { Dock, DockIcon } from "@/components/ui/dock";
import { cn } from "@/lib/utils";

const sections = [
  { href: "/settings/sources", label: "Sources", short: "Sources", icon: TvIcon },
  {
    href: "/settings/epg",
    label: "EPG & Logos",
    short: "EPG",
    icon: CalendarIcon,
  },
  {
    href: "/settings/llm",
    label: "LLM Provider",
    short: "LLM",
    icon: WaypointsIcon,
  },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const signedIn = Boolean(session?.user);

  // Settings are entirely per-account (sources, LLM keys, EPG/logo prefs), so
  // they're useless signed out. Bounce anyone who lands here without a session.
  React.useEffect(() => {
    if (!isPending && !signedIn) {
      router.replace("/");
    }
  }, [isPending, signedIn, router]);

  if (!isPending && !signedIn) {
    // Definitely signed out; we're about to redirect, so render nothing
    // rather than flashing the settings chrome.
    return null;
  }

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <Sidebar
        collapsible="none"
        className="m-2 hidden h-[calc(100svh---spacing(4))] rounded-xl md:flex"
      >
        <SidebarHeader className="p-3">
          <Link
            href="/"
            aria-label="Back to Portal Hop"
            className="flex items-center rounded-md px-1 py-1 transition-[opacity,transform] duration-[160ms] ease-out hover:opacity-80 active:scale-[0.985]"
          >
            <PortalHopWordmark />
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {sections.map((section) => (
                  <SidebarMenuItem key={section.href}>
                    <SidebarMenuButton
                      render={<Link href={section.href} />}
                      isActive={pathname === section.href}
                    >
                      <section.icon />
                      <span>{section.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset className="overflow-y-auto">
        {/* Logo at the top on mobile (the sidebar is hidden there). */}
        <div className="flex justify-center px-5 pt-8 pb-2 md:hidden">
          <Link
            href="/"
            aria-label="Back to Portal Hop"
            className="inline-flex transition-[opacity,transform] duration-[160ms] ease-out hover:opacity-80 active:scale-[0.985]"
          >
            <PortalHopWordmark className="scale-125" />
          </Link>
        </div>
        <div className="min-w-0 max-w-3xl flex-1 p-5 pb-28 sm:p-6 md:pb-8 lg:p-8">
          {children}
        </div>
      </SidebarInset>

      {/* Floating dock nav (mobile only). */}
      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center p-4 md:hidden">
        <Dock
          className="pointer-events-auto mt-0 h-auto gap-2 rounded-full border bg-background/70 p-2 shadow-2xl shadow-primary/20 backdrop-blur-xl"
          iconSize={44}
          disableMagnification
        >
          {sections.map((section) => {
            const isActive = pathname === section.href;
            return (
              <DockIcon
                key={section.href}
                className={cn(
                  "relative transition-[color,background-color,filter]",
                  isActive
                    ? "bg-primary text-primary-foreground hover:bg-primary hover:brightness-90"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Link
                  href={section.href}
                  aria-label={section.label}
                  className="absolute inset-0 flex items-center justify-center rounded-full"
                >
                  <section.icon className="size-5 shrink-0" />
                </Link>
              </DockIcon>
            );
          })}
        </Dock>
      </nav>
    </SidebarProvider>
  );
}
