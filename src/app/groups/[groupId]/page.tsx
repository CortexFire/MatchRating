export const dynamic = "force-dynamic";

import Link from "next/link";
import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";
import { getGroup } from "@/lib/app-data";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const group = await getGroup(groupId);
  const recordHref = `/groups/${groupId}/matches/new`;

  const links = [
    { label: "Members", href: `/groups/${groupId}/members` },
    { label: "Rankings", href: `/groups/${groupId}/rankings` },
  ];

  return (
    <MobileShell active="Group" recordHref={recordHref}>
      <ScreenHeader title={group?.name ?? "Group"} backHref="/groups" />
      {group ? (
        <section className="flex flex-col gap-2">
          {links.map((link) => (
            <Card key={link.label}>
              <CardContent className="p-0">
                <Link
                  href={link.href}
                  className="flex items-center gap-3 p-4 transition hover:bg-app-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold text-ink">{link.label}</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden="true" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : (
        <p className="rounded-lg border border-stroke bg-surface p-4 text-sm text-muted">Group not found.</p>
      )}
    </MobileShell>
  );
}
