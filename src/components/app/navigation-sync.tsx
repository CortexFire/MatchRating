"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ComponentProps,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type SyncHandler = () => Promise<void>;

type NavigationSyncContextValue = {
  active: boolean;
  register: (handler: SyncHandler) => () => void;
  run: () => Promise<void>;
};

const NavigationSyncContext = createContext<NavigationSyncContextValue | null>(null);

export function NavigationSyncProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<SyncHandler | null>(null);
  const [active, setActive] = useState(false);
  const register = useCallback((handler: SyncHandler) => {
    handlerRef.current = handler;
    setActive(true);
    return () => {
      if (handlerRef.current === handler) {
        handlerRef.current = null;
        setActive(false);
      }
    };
  }, []);
  const value = useMemo<NavigationSyncContextValue>(() => ({
    active,
    register,
    run: () => handlerRef.current?.() ?? Promise.resolve(),
  }), [active, register]);

  return (
    <NavigationSyncContext.Provider value={value}>
      {children}
    </NavigationSyncContext.Provider>
  );
}

export function useNavigationSyncRegistration(handler: SyncHandler) {
  const context = useContext(NavigationSyncContext);
  const register = context?.register;
  const latestHandler = useRef(handler);

  useEffect(() => {
    latestHandler.current = handler;
  }, [handler]);

  useEffect(() => register?.(() => latestHandler.current()), [register]);
}

export function useNavigationSync() {
  const context = useContext(NavigationSyncContext);
  return context?.run ?? (() => Promise.resolve());
}

type SyncAwareLinkProps = Omit<ComponentProps<typeof Link>, "href" | "onNavigate"> & {
  href: string;
};

export function SyncAwareLink({ href, ...props }: SyncAwareLinkProps) {
  const context = useContext(NavigationSyncContext);

  if (!context?.active) return <Link {...props} href={href} />;

  return <ActiveSyncLink {...props} href={href} context={context} />;
}

function ActiveSyncLink({
  href,
  context,
  ...props
}: SyncAwareLinkProps & { context: NavigationSyncContextValue }) {
  const router = useRouter();

  return (
    <Link
      {...props}
      href={href}
      onNavigate={(event) => {
        event.preventDefault();
        void (async () => {
          try {
            await context.run();
          } catch {
            // Leaving after a failed sync is the selected product behavior.
          } finally {
            router.push(href);
          }
        })();
      }}
    />
  );
}
