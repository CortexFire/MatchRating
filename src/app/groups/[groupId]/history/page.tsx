export const dynamic = "force-dynamic";

import { Search } from "lucide-react";
import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  return (
    <MobileShell active="History" recordHref={`/groups/${groupId}/matches/new`}>
      <ScreenHeader title="Match history" subtitle="Historical revisions are the source of truth for every rating rebuild." backHref={`/groups/${groupId}`} />
      <div className="flex gap-2">
        <Badge tone="selected">All</Badge>
        <Badge>Pending</Badge>
        <Badge>Disputed</Badge>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input className="pl-9" placeholder="Search matches" />
      </div>
      <p className="rounded-lg border border-stroke bg-surface p-4 text-sm text-muted">No matches recorded yet.</p>
    </MobileShell>
  );
}
