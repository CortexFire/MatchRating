import Link from "next/link";
import { Home, Plus, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Home", href: "/home", icon: Home },
  { label: "Record", href: "/groups", icon: Plus, primary: true },
  { label: "Groups", href: "/groups", icon: UsersRound },
];

export function MobileShell({
  children,
  active,
  showNav = true,
  surfaceClassName,
  recordHref,
}: {
  children: React.ReactNode;
  active?: string;
  showNav?: boolean;
  surfaceClassName?: string;
  recordHref?: string;
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
          <div className="flex min-h-full flex-col gap-5 px-4 py-8 pb-6">{children}</div>
        </div>
        {showNav ? (
          <nav className="grid h-[78px] shrink-0 grid-cols-3 items-center border-t border-stroke bg-surface/95 px-4 backdrop-blur">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.label;
              const href = item.primary && recordHref ? recordHref : item.href;

              return (
                <Link
                  key={item.label}
                  href={href}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "mx-auto inline-flex size-12 items-center justify-center rounded-lg text-muted transition hover:text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
                    isActive && "text-action",
                    item.primary &&
                      "size-14 rounded-full border-4 border-muted bg-surface text-muted hover:border-action hover:text-action",
                    item.primary && isActive && "border-action text-action bg-green-200",
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      "stroke-[2.7]",
                      item.primary ? "size-8" : "size-9",
                      isActive && "fill-green-200",
                    )}
                  />
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>
    </main>
  );
}