import Link from "next/link";
import { MobileShell } from "@/components/app/mobile-shell";
import { PlayerRow } from "@/components/app/player-row";
import { ScreenHeader } from "@/components/app/screen-header";
import { Button } from "@/components/ui/button";
import { demoGroup, demoPlayers } from "@/lib/demo-data";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  return (
    <MobileShell active="Home">
      <ScreenHeader
        title="Members"
        subtitle={`${demoGroup.memberCount} active players in this group.`}
        backHref="/groups/demo"
        action={
          <Button asChild className="shrink-0 px-3 text-xs">
            <Link href={`/groups/${groupId}/invite`}>Invite Members</Link>
          </Button>
        }
      />
      <section className="flex flex-col gap-2">
        {demoPlayers.map((player) => (
          <PlayerRow key={player.id} player={player} />
        ))}
      </section>
    </MobileShell>
  );
}
