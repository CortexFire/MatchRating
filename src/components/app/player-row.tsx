import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { AvatarInitials } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { type DemoPlayer } from "@/lib/demo-data";

export function PlayerRow({ player }: { player: DemoPlayer }) {
  return (
    <article className="flex items-center gap-3 rounded-lg border border-stroke bg-surface p-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">
        {player.rank}
      </div>
      <AvatarInitials initials={player.initials} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-ink">{player.name}</h3>
          {player.status === "Pending review" ? <Badge>Review</Badge> : null}
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {player.record} · RD {player.rd} · {player.gamesPlayed} games
        </p>
      </div>
      <div className="text-right">
        <p className="text-base font-bold tabular-nums text-ink">{player.rating}</p>
        <p className="flex items-center justify-end gap-1 text-xs font-semibold text-muted">
          {player.trend >= 0 ? (
            <ArrowUpRight className="size-3 text-muted" />
          ) : (
            <ArrowDownRight className="size-3 text-muted" />
          )}
          {player.trend >= 0 ? "+" : ""}
          {player.trend}
        </p>
      </div>
    </article>
  );
}
