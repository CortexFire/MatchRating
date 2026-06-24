export const dynamic = "force-dynamic";

import Link from "next/link";
import { ChevronRight, UsersRound } from "lucide-react";
import { MobileShell } from "@/components/app/mobile-shell";
import { AvatarInitials } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentProfile, listCurrentUserGroups } from "@/lib/app-data";

export default async function HomePage() {
  const [profile, groups] = await Promise.all([getCurrentProfile(), listCurrentUserGroups()]);
  const primaryGroup = groups[0];

  return (
    <MobileShell active="Home" recordHref={primaryGroup ? `/groups/${primaryGroup.id}/matches/new` : undefined}>
      <section className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted">Welcome back</p>
          <h1 className="truncate text-3xl font-bold leading-9 text-ink">{profile.name}</h1>
        </div>
        <Link
          href="/profile"
          aria-label="Open profile"
          className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          <AvatarInitials initials={profile.initials} />
        </Link>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">Groups</h2>
        {groups.length ? (
          groups.map((group) => (
            <Card key={group.id}>
              <CardContent className="p-0">
                <Link
                  href={`/groups/${group.id}`}
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
          ))
        ) : (
          <p className="rounded-lg border border-stroke bg-surface p-4 text-sm text-muted">Create or join a group to start recording matches.</p>
        )}
      </section>
    </MobileShell>
  );
}
