export const dynamic = "force-dynamic";

import { getOrCreateInvite } from "@/app/actions";
import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { InvitePanel } from "@/components/invite/invite-panel";
import { Card, CardContent } from "@/components/ui/card";
import { getGroup } from "@/lib/app-data";

export default async function GroupInvitePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const [group, invite] = await Promise.all([getGroup(groupId), getOrCreateInvite(groupId)]);

  return (
    <MobileShell active="Home" showNav={false}>
      <ScreenHeader title="Join Group" subtitle={group?.name} backHref={`/groups/${groupId}/members`} />
      {invite.ok ? (
        <InvitePanel inviteUrl={invite.data.url} />
      ) : (
        <Card>
          <CardContent className="p-5 text-sm leading-6 text-muted">{invite.message}</CardContent>
        </Card>
      )}
    </MobileShell>
  );
}
