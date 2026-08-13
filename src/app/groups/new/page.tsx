import { Suspense } from "react";
import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateGroupForm } from "@/components/groups/create-group-form";
import { listCurrentUserGroups } from "@/lib/app-data";
import GroupsLoading from "../loading";

export const unstable_instant = { prefetch: "static" };

export default function NewGroupPage() {
  return (
    <Suspense fallback={<GroupsLoading />}>
      <NewGroupContent />
    </Suspense>
  );
}

export async function NewGroupContent() {
  const groups = await listCurrentUserGroups();
  const primaryGroup = groups[0];

  return (
    <MobileShell active="Home" recordHref={primaryGroup ? `/groups/${primaryGroup.id}/matches/new` : undefined}>
      <ScreenHeader title="Create group" backHref="/groups" />
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
