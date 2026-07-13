import Link from "next/link";
import { SettingsIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SettingsLink() {
  return (
    <Link
      href="/settings"
      aria-label="Settings"
      className={cn(
        buttonVariants({ variant: "ghost", size: "icon" }),
        "size-8 rounded-md text-muted-foreground hover:text-foreground"
      )}
    >
      <SettingsIcon className="size-4" />
    </Link>
  );
}
