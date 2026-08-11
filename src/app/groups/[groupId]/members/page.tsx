export const dynamic = "force-dynamic";

import Link from "next/link";
import { MobileShell } from "@/components/app/mobile-shell";
import { PlayerRow } from "@/components/app/player-row";
import { ScreenHeader } from "@/components/app/screen-header";
import { Button } from "@/components/ui/button";
import { getGroup, listGroupPlayers } from "@/lib/app-data";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const [group, players] = await Promise.all([getGroup(groupId), listGroupPlayers(groupId)]);
  const recordHref = `/groups/${groupId}/matches/new`;
  const activePlayerCount = players.filter((player) => player.status === "Active").length;

  return (
    <MobileShell active="Home" recordHref={recordHref}>
      <ScreenHeader
        title="Members"
        subtitle={group ? `${activePlayerCount} active of ${group.memberCount} members.` : undefined}
        backHref={`/groups/${groupId}`}
        action={
          <Button asChild className="shrink-0 px-3 text-xs">
            <Link href={`/groups/${groupId}/invite`}>Invite Members</Link>
          </Button>
        }
      />
      {players.length ? (
        <section className="flex flex-col gap-2">
          {players.map((player) => (
            <PlayerRow key={player.id} player={player} />
          ))}
        </section>
      ) : (
        <p className="rounded-lg border border-stroke bg-surface p-4 text-sm text-muted">No members yet.</p>
      )}
    </MobileShell>
  );
}
