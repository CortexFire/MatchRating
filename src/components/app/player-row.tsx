import { AvatarInitials } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { type AppPlayer } from "@/lib/app-data";

export function PlayerRow({ player }: { player: AppPlayer }) {
  return (
    <article className="flex h-[70px] shrink-0 items-center gap-3 rounded-lg border border-stroke bg-surface px-3 py-2">
      <Badge aria-label={`Rank ${player.rank}`} className="shrink-0">
        #{player.rank}
      </Badge>
      <AvatarInitials initials={player.initials} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-ink">{player.name}</h3>
          <Badge>{player.role}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted">{player.gamesPlayed} games</p>
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <p className="text-base font-bold text-ink">{player.rating}</p>
        <p className="text-xs text-muted">± {player.rd} RD</p>
      </div>
    </article>
  );
}
