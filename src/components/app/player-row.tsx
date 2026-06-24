import { AvatarInitials } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { type AppPlayer } from "@/lib/app-data";

export function PlayerRow({ player }: { player: AppPlayer }) {
  return (
    <article className="flex items-center gap-3 rounded-lg border border-stroke bg-surface p-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">
        {player.rank}
      </div>
      <AvatarInitials initials={player.initials} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-ink">{player.name}</h3>
          <Badge>{player.role}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          RD {player.rd} - {player.gamesPlayed} games
        </p>
      </div>
      <p className="text-base font-bold tabular-nums text-ink">{player.rating}</p>
    </article>
  );
}