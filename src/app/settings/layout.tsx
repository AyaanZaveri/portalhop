"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const sections = [
  { href: "/settings/general", label: "General" },
  { href: "/settings/sources", label: "Sources" },
  { href: "/settings/ai", label: "AI Provider" },
  { href: "/settings/epg", label: "EPG Status" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Back"
        >
          <ArrowLeftIcon className="size-4" />
        </Link>
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
      </div>

      <div className="flex flex-1 flex-col gap-6 sm:flex-row sm:gap-10">
        <nav className="flex shrink-0 flex-row gap-1 overflow-x-auto sm:w-44 sm:flex-col sm:overflow-visible">
          {sections.map((section) => {
            const isActive = pathname === section.href;

            return (
              <Link
                key={section.href}
                href={section.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                {section.label}
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 pb-8">{children}</div>
      </div>
    </div>
  );
}
