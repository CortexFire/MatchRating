import Link from "next/link";
import { redirect } from "next/navigation";
import { getInviteSummary } from "@/app/actions";
import { MobileShell } from "@/components/app/mobile-shell";
import { InviteDecisionForm } from "@/components/invite/invite-decision-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const summary = await getInviteSummary(token);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const nextPath = `/onboarding?invite=${encodeURIComponent(token)}`;

  if (!summary.ok) {
    return (
      <MobileShell showNav={false}>
        <section className="flex min-h-[calc(100dvh-64px)] flex-col justify-center">
          <Card>
            <CardContent className="p-5 text-center text-sm text-muted">{summary.message}</CardContent>
          </Card>
        </section>
      </MobileShell>
    );
  }

  if (!userId) {
    return (
      <MobileShell showNav={false}>
        <section className="flex min-h-[calc(100dvh-64px)] flex-col justify-center">
          <Card>
            <CardContent className="flex flex-col gap-4 p-5 text-center">
              <h1 className="text-xl font-bold text-ink">You have been invited to join</h1>
              <div className="rounded-lg border border-stroke bg-white px-4 py-7 text-center">
                <h2 className="text-2xl font-bold leading-8 text-ink">{summary.data.groupName}</h2>
                <p className="mt-7 text-xs text-muted">{summary.data.lastActiveText}</p>
                <p className="mt-3 text-xs text-muted">{summary.data.memberCount} players</p>
              </div>
              <p className="text-sm text-muted">Sign in to continue.</p>
              <Button asChild>
                <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>Sign in</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/groups/new">No thanks</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </MobileShell>
    );
  }

  const service = createSupabaseServiceClient();
  const [
    { data: profile, error: profileError },
    { data: membership, error: membershipError },
  ] = await Promise.all([
    service
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .eq("is_guest", false)
      .maybeSingle(),
    service
      .from("group_memberships")
      .select("id")
      .eq("group_id", summary.data.groupId)
      .eq("user_id", userId)
      .eq("status", "active")
      .is("left_at", null)
      .maybeSingle(),
  ]);

  if (profileError) {
    throw profileError;
  }

  if (membershipError) {
    throw membershipError;
  }

  if (!profile) {
    redirect(nextPath);
  }

  const mode = membership ? "already-member" : "invite";

  return (
    <MobileShell showNav={false}>
      <section className="flex min-h-[calc(100dvh-64px)] flex-col justify-center">
        <Card>
          <CardContent className="flex flex-col gap-6 p-6">
            <h1 className="text-center text-xl font-bold leading-7 text-muted">
              {mode === "already-member" ? "You're already in" : "You've been invited to join"}
            </h1>
            <InviteDecisionForm token={token} summary={summary.data} mode={mode} />
          </CardContent>
        </Card>
      </section>
    </MobileShell>
  );
}
