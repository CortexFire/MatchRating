import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ScreenHeader({
  title,
  subtitle,
  backHref,
  action,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {backHref ? (
          <Button asChild variant="secondary" className="size-11 px-0">
            <Link href={backHref} aria-label="Go back">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-8 text-ink">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm leading-5 text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </header>
  );
}
