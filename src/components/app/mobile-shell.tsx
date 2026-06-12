import Link from "next/link";
import { Home, Plus, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Home", href: "/groups/demo", icon: Home },
  { label: "Record", href: "/groups/demo/matches/new", icon: Plus },
  { label: "Profile", href: "/profile", icon: UserRound },
];

export function MobileShell({
  children,
  active,
  showNav = true,
  surfaceClassName,
}: {
  children: React.ReactNode;
  active?: string;
  showNav?: boolean;
  surfaceClassName?: string;
}) {
  return (
    <main className="h-dvh overflow-hidden bg-app-bg text-ink">
      <div
        className={cn(
          "mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-app-bg",
          surfaceClassName,
        )}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full flex-col gap-4 px-4 py-5">{children}</div>
        </div>
        {showNav ? (
          <nav className="grid shrink-0 grid-cols-3 border-t border-stroke bg-surface/95 px-2 py-2 backdrop-blur">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.label;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-semibold text-muted transition",
                    isActive && "bg-selection text-ink",
                  )}
                >
                  <Icon aria-hidden="true" className="size-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>
    </main>
  );
}
