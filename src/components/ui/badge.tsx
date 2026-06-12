import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "selected" | "victory";
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold",
        tone === "selected" && "border-selection-stroke bg-selection text-ink",
        tone === "victory" && "border-victory-stroke bg-victory text-ink",
        tone === "neutral" && "border-stroke bg-surface text-muted",
        className,
      )}
      {...props}
    />
  );
}
