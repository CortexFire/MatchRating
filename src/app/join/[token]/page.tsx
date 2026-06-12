import Link from "next/link";
import { UsersRound } from "lucide-react";
import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { demoGroup } from "@/lib/demo-data";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <MobileShell showNav={false}>
      <ScreenHeader title="Join group" subtitle="Invitation links are hashed at rest; this token is only shown in the URL." backHref="/login" />
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-5 text-center">
          <div className="flex size-16 items-center justify-center rounded-lg bg-selection text-ink">
            <UsersRound className="size-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{demoGroup.name}</h1>
            <p className="mt-2 text-sm leading-5 text-muted">{demoGroup.description}</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 rounded-lg border border-stroke bg-app-bg p-3 text-sm">
            <div>
              <p className="font-bold">{demoGroup.memberCount}</p>
              <p className="text-xs text-muted">members</p>
            </div>
            <div>
              <p className="font-bold">Active</p>
              <p className="text-xs text-muted">last night</p>
            </div>
          </div>
          <p className="break-all rounded-lg border border-stroke bg-app-bg p-3 text-xs text-muted">Token preview: {token}</p>
          <Button asChild className="w-full">
            <Link href="/groups/demo">Accept invite</Link>
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link href="/login">No thanks</Link>
          </Button>
        </CardContent>
      </Card>
    </MobileShell>
  );
}
