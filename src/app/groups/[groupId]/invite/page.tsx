export const unstable_instant = {
  prefetch: "static",
  samples: [{ params: { groupId: "00000000-0000-0000-0000-000000000000" } }],
};

import { Suspense } from "react";
import { getOrCreateInvite } from "@/app/actions";
import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { InvitePanel } from "@/components/invite/invite-panel";
import { Card, CardContent } from "@/components/ui/card";
import { getPrivateGroupMetadata } from "@/lib/personalized-cache";
import GroupLoading from "../loading";

type GroupInvitePageProps = {
  params: Promise<{ groupId: string }>;
};

export default function GroupInvitePage(props: GroupInvitePageProps) {
  return (
    <Suspense fallback={<GroupLoading />}>
      <GroupInviteContent {...props} />
    </Suspense>
  );
}

export async function GroupInviteContent({ params }: GroupInvitePageProps) {
  const { groupId } = await params;
  const [group, invite] = await Promise.all([
    getPrivateGroupMetadata(groupId),
    getOrCreateInvite(groupId),
  ]);

  return (
    <MobileShell active="Home" showNav={false}>
      <ScreenHeader title="Join Group" subtitle={group?.name} backHref={`/groups/${groupId}`} />
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
