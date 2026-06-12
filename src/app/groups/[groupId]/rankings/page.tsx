import { Search } from "lucide-react";
import { MobileShell } from "@/components/app/mobile-shell";
import { PlayerRow } from "@/components/app/player-row";
import { ScreenHeader } from "@/components/app/screen-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { demoPlayers } from "@/lib/demo-data";

export default function RankingsPage() {
  return (
    <MobileShell active="Rank">
      <ScreenHeader title="Rankings" subtitle="Glicko-2 ratings are isolated to this group." backHref="/groups/demo" />
      <div className="flex gap-2">
        <Badge tone="selected">Overall</Badge>
        <Badge>Singles</Badge>
        <Badge>Doubles</Badge>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input className="pl-9" placeholder="Search rankings" />
      </div>
      <section className="flex flex-col gap-2">
        {demoPlayers.map((player) => (
          <PlayerRow key={player.id} player={player} />
        ))}
      </section>
    </MobileShell>
  );
}
