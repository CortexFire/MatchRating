import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { PlayerRow } from "@/components/app/player-row";
import { Button } from "@/components/ui/button";
import { type AppPlayer } from "@/lib/app-data";

export function GroupMembersDisclosure({ players, inviteHref }: { players: AppPlayer[]; inviteHref: string }) {
  return (
    <section className="flex flex-col gap-3">
      <details className="group rounded-lg border border-stroke bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-base font-bold text-ink">
          <span>Members ({players.length})</span>
          <ChevronDown className="size-5 text-muted transition group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-stroke p-4">
          {players.length ? (
            <div
              role="region"
              aria-label="Group members"
              tabIndex={players.length > 5 ? 0 : undefined}
              className="flex max-h-[425px] flex-col gap-2 overflow-y-auto rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              {players.map((player) => (
                <PlayerRow key={player.id} player={player} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No members yet.</p>
          )}
        </div>
      </details>
      <Button asChild variant="secondary" className="w-full">
        <Link href={inviteHref}>Invite members</Link>
      </Button>
    </section>
  );
}
