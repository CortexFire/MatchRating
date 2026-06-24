import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateGroupForm } from "@/components/groups/create-group-form";

export default function NewGroupPage() {
  return (
    <MobileShell active="Home">
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
