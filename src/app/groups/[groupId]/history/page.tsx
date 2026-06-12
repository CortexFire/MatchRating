import { Search } from "lucide-react";
import { MobileShell } from "@/components/app/mobile-shell";
import { MatchRow } from "@/components/app/match-row";
import { ScreenHeader } from "@/components/app/screen-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { demoMatches } from "@/lib/demo-data";

export default function HistoryPage() {
  return (
    <MobileShell active="History">
      <ScreenHeader title="Match history" subtitle="Historical revisions are the source of truth for every rating rebuild." backHref="/groups/demo" />
      <div className="flex gap-2">
        <Badge tone="selected">All</Badge>
        <Badge>Pending</Badge>
        <Badge>Disputed</Badge>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input className="pl-9" placeholder="Search matches" />
      </div>
      <section className="flex flex-col gap-2">
        {demoMatches.map((match) => (
          <MatchRow key={match.id} match={match} />
        ))}
      </section>
    </MobileShell>
  );
}
