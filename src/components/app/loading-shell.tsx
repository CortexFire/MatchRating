import { MobileShell } from "@/components/app/mobile-shell";

export function AppLoadingShell({
  active,
  children,
  label,
  showNav = true,
}: {
  active?: string;
  children?: React.ReactNode;
  label: string;
  showNav?: boolean;
}) {
  return (
    <MobileShell active={active} showNav={showNav}>
      <section aria-busy="true" aria-label={label} role="status" className="flex flex-col gap-5">
        <span className="sr-only">{label}</span>
        <div aria-hidden="true" className="h-8 w-2/3 rounded-lg bg-stroke motion-safe:animate-pulse" />
        {children ?? <SectionSkeleton rows={3} />}
      </section>
    </MobileShell>
  );
}

export function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          data-skeleton-row="true"
          className="h-20 rounded-lg border border-stroke bg-surface motion-safe:animate-pulse"
        />
      ))}
    </div>
  );
}
