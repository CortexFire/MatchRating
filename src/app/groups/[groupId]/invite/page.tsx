import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { InvitePanel } from "@/components/invite/invite-panel";
import { demoGroup } from "@/lib/demo-data";

export default async function GroupInvitePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  return (
    <MobileShell active="Home" showNav={false}>
      <ScreenHeader
        title="Join Group"
        subtitle={demoGroup.name}
        backHref={`/groups/${groupId}/members`}
        action={
          <span className="shrink-0 rounded-full bg-victory px-3 py-2 text-xs font-bold text-ink">
            {demoGroup.name.split(" ").slice(0, 2).join(" ")}
          </span>
        }
      />
      <div className="flex flex-1 items-center">
        <InvitePanel inviteUrl={demoGroup.inviteUrl} />
      </div>
    </MobileShell>
  );
}
