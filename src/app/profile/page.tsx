export const dynamic = "force-dynamic";

import Link from "next/link";
import { ChevronRight, UsersRound } from "lucide-react";
import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { AvatarInitials } from "@/components/ui/avatar";
import { signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentProfile, listCurrentUserGroups } from "@/lib/app-data";

export default async function ProfilePage() {
  const [profile, groups] = await Promise.all([getCurrentProfile(), listCurrentUserGroups()]);

  return (
    <MobileShell active="Profile">
      <section className="flex items-center gap-4">
        <AvatarInitials initials={profile.initials} className="size-16 text-lg" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted">Profile</p>
          <h1 className="truncate text-2xl font-bold leading-8 text-ink">{profile.name}</h1>
        </div>
      </section>

      <ScreenHeader title="Groups" />
      {groups.length ? (
        <section className="flex flex-col gap-3">
          {groups.map((group) => (
            <Card key={group.id}>
              <CardContent className="p-0">
                <Link
                  href={`/groups/${group.id}/members`}
                  className="flex items-center gap-3 p-4 transition hover:bg-app-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-victory-stroke bg-victory text-ink">
                    <UsersRound className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold text-ink">{group.name}</span>
                    <span className="mt-1 block truncate text-sm text-muted">{group.memberCount} members</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden="true" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : (
        <p className="rounded-lg border border-stroke bg-surface p-4 text-sm text-muted">No groups yet.</p>
      )}

      <form action={signOut} className="mt-auto pt-4">
        <Button type="submit" variant="secondary" className="w-full">
          Log out
        </Button>
      </form>
    </MobileShell>
  );
}
