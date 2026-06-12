import { type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-lg border border-stroke bg-surface px-3 text-sm text-ink outline-none transition placeholder:text-muted focus:border-selection-stroke focus:ring-4 focus:ring-selection",
        className,
      )}
      {...props}
    />
  );
}
