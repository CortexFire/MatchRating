import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { PlayerRow } from "@/components/app/player-row";
import { Button } from "@/components/ui/button";
import { type AppPlayer } from "@/lib/app-data";

export function GroupMembersDisclosure({ players, inviteHref }: { players: AppPlayer[]; inviteHref: string }) {
  return (
    <details className="group rounded-lg border border-stroke bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-base font-bold text-ink">
        <span>Members ({players.length})</span>
        <ChevronDown className="size-5 text-muted transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="flex flex-col gap-3 border-t border-stroke p-4">
        {players.length ? (
          <div className="flex flex-col gap-2">
            {players.map((player) => (
              <PlayerRow key={player.id} player={player} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No active members yet.</p>
        )}
        <Button asChild variant="secondary" className="w-full">
          <Link href={inviteHref}>Invite members</Link>
        </Button>
      </div>
    </details>
  );
}
