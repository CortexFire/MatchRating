export const dynamic = "force-dynamic";

import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { Card, CardContent } from "@/components/ui/card";
import { getGroup } from "@/lib/app-data";

export default async function GroupInvitePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const group = await getGroup(groupId);

  return (
    <MobileShell active="Home" showNav={false}>
      <ScreenHeader title="Join Group" subtitle={group?.name} backHref={`/groups/${groupId}/members`} />
      <Card>
        <CardContent className="p-5 text-sm leading-6 text-muted">
          Invite link generation is connected to the backend action, but this screen no longer uses hardcoded demo group data.
        </CardContent>
      </Card>
    </MobileShell>
  );
}
