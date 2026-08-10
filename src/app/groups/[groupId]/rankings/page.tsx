export const dynamic = "force-dynamic";

import { Search } from "lucide-react";
import { MobileShell } from "@/components/app/mobile-shell";
import { PlayerRow } from "@/components/app/player-row";
import { ScreenHeader } from "@/components/app/screen-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RatingRebuildStatus } from "@/components/match/rating-rebuild-status";
import { getGroupRatingRebuildStatus, listGroupPlayers } from "@/lib/app-data";

export default async function RankingsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const [players, ratingStatus] = await Promise.all([listGroupPlayers(groupId), getGroupRatingRebuildStatus(groupId)]);
  const recordHref = `/groups/${groupId}/matches/new`;

  return (
    <MobileShell active="Rank" recordHref={recordHref}>
      <ScreenHeader title="Rankings" backHref={`/groups/${groupId}`} />
      <div className="flex gap-2">
        <Badge tone="selected">Overall</Badge>
        <Badge>Singles</Badge>
        <Badge>Doubles</Badge>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input className="pl-9" placeholder="Search rankings" />
      </div>
      <RatingRebuildStatus
        groupId={groupId}
        jobId={ratingStatus.id}
        status={ratingStatus.status}
        canRetry={ratingStatus.canRetry}
      />
      {players.length ? (
        <section className="flex flex-col gap-2">
          {players.map((player) => (
            <PlayerRow key={player.id} player={player} />
          ))}
        </section>
      ) : (
        <p className="rounded-lg border border-stroke bg-surface p-4 text-sm text-muted">No rankings yet.</p>
      )}
    </MobileShell>
  );
}
