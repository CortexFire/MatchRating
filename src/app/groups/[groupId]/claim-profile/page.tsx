import { redirect } from "next/navigation";
import { listClaimableGuestProfiles } from "@/app/actions";
import { MobileShell } from "@/components/app/mobile-shell";
import { ClaimProfileForm } from "@/components/invite/claim-profile-form";
import { Card, CardContent } from "@/components/ui/card";

export default async function ClaimProfilePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const result = await listClaimableGuestProfiles(groupId);

  if (!result.ok || result.data.profiles.length === 0) {
    redirect(`/groups/${groupId}`);
  }

  return (
    <MobileShell showNav={false}>
      <p className="-mb-2 truncate text-base text-ink">Claiming an existing guest profile</p>
      <section className="flex min-h-[calc(100dvh-64px)] flex-col justify-center">
        <Card>
          <CardContent className="p-6">
            <ClaimProfileForm groupId={groupId} profiles={result.data.profiles} />
          </CardContent>
        </Card>
      </section>
    </MobileShell>
  );
}
