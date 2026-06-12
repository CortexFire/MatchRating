import { cn } from "@/lib/utils";

export function AvatarInitials({
  initials,
  className,
}: {
  initials: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full bg-victory text-sm font-bold text-ink",
        className,
      )}
    >
      {initials}
    </div>
  );
}
