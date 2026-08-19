export const unstable_instant = {
  prefetch: "static",
  samples: [{ params: { groupId: "00000000-0000-0000-0000-000000000000" } }],
};

import { redirect } from "next/navigation";
import { Suspense } from "react";
import { listClaimableGuestProfiles } from "@/app/actions";
import { MobileShell } from "@/components/app/mobile-shell";
import { ClaimProfileForm } from "@/components/invite/claim-profile-form";
import { Card, CardContent } from "@/components/ui/card";
import GroupLoading from "../loading";
import styles from "./page.module.css";

type ClaimProfilePageProps = {
  params: Promise<{ groupId: string }>;
};

export default function ClaimProfilePage(props: ClaimProfilePageProps) {
  return (
    <Suspense fallback={<GroupLoading />}>
      <ClaimProfileContent {...props} />
    </Suspense>
  );
}

export async function ClaimProfileContent({ params }: ClaimProfilePageProps) {
  const { groupId } = await params;
  const result = await listClaimableGuestProfiles(groupId);

  if (!result.ok) {
    redirect(`/groups/${groupId}`);
  }

  if (result.data.profiles.length === 0) {
    redirect("/home");
  }

  return (
    <MobileShell showNav={false}>
      <section className={styles.content}>
        <Card>
          <CardContent className={styles.cardContent}>
            <ClaimProfileForm groupId={groupId} profiles={result.data.profiles} />
          </CardContent>
        </Card>
      </section>
    </MobileShell>
  );
}
