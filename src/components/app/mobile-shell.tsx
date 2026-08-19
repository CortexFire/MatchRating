import clsx from "clsx";
import { Home, Plus, UsersRound } from "lucide-react";
import { NavigationSyncProvider, SyncAwareLink } from "@/components/app/navigation-sync";
import styles from "./mobile-shell.module.css";

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
    <NavigationSyncProvider>
      <main className={styles.viewport}>
        <div className={clsx(styles.shell, surfaceClassName)}>
          <div className={styles.scrollArea}>
            <div className={styles.content}>{children}</div>
          </div>
          {showNav ? (
            <nav className={styles.navigation}>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.label;
                const href = item.primary && recordHref ? recordHref : item.href;

                return (
                  <SyncAwareLink
                    key={item.label}
                    href={href}
                    aria-label={item.label}
                    aria-current={isActive ? "page" : undefined}
                    className={clsx(
                      styles.navigationLink,
                      isActive && styles.navigationLinkActive,
                      item.primary && styles.primaryNavigationLink,
                      item.primary && isActive && styles.primaryNavigationLinkActive,
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      className={clsx(
                        styles.navigationIcon,
                        item.primary ? styles.primaryNavigationIcon : styles.standardNavigationIcon,
                        isActive && styles.navigationIconActive,
                      )}
                    />
                  </SyncAwareLink>
                );
              })}
            </nav>
          ) : null}
        </div>
      </main>
    </NavigationSyncProvider>
  );
}
