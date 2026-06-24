export const dynamic = "force-dynamic";

import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { Card, CardContent } from "@/components/ui/card";

export default async function MatchPage({
  params,
}: {
  params: Promise<{ groupId: string; matchId: string }>;
}) {
  const { groupId } = await params;

  return (
    <MobileShell active="History" recordHref={`/groups/${groupId}/matches/new`}>
      <ScreenHeader title="Confirm result" subtitle="Match review will use stored revisions once match reads are wired." backHref={`/groups/${groupId}/history`} />
      <Card>
        <CardContent className="p-5 text-sm text-muted">No match details are available yet.</CardContent>
      </Card>
    </MobileShell>
  );
}
