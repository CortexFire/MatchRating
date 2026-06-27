import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateGroupForm } from "@/components/groups/create-group-form";
import { listCurrentUserGroups } from "@/lib/app-data";

export const dynamic = "force-dynamic";

export default async function NewGroupPage() {
  const groups = await listCurrentUserGroups();
  const primaryGroup = groups[0];

  return (
    <MobileShell active="Home" recordHref={primaryGroup ? `/groups/${primaryGroup.id}/matches/new` : undefined}>
      <ScreenHeader title="Create group" subtitle="Ratings, history, and rankings stay independent per group." backHref="/groups" />
      <Card>
        <CardHeader>
          <CardTitle>Group details</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateGroupForm />
        </CardContent>
      </Card>
    </MobileShell>
  );
}
