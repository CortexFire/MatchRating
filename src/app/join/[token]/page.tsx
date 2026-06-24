import Link from "next/link";
import { UsersRound } from "lucide-react";
import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
            <h1 className="text-2xl font-bold">Group invitation</h1>
            <p className="mt-2 text-sm leading-5 text-muted">Sign in to accept this invitation.</p>
          </div>
          <p className="break-all rounded-lg border border-stroke bg-app-bg p-3 text-xs text-muted">Token preview: {token}</p>
          <Button asChild className="w-full">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link href="/groups">No thanks</Link>
          </Button>
        </CardContent>
      </Card>
    </MobileShell>
  );
}
