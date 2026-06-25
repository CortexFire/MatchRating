import { redirect } from "next/navigation";
import { MobileShell } from "@/components/app/mobile-shell";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { Card, CardContent } from "@/components/ui/card";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

function safeInvite(value?: string | string[]) {
  const invite = Array.isArray(value) ? value[0] : value;
  return invite || undefined;
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<{ invite?: string | string[] }>;
}) {
  const params = searchParams ? await searchParams : {};
  const inviteToken = safeInvite(params.invite);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || !userId) {
    redirect(`/login${inviteToken ? `?next=/onboarding%3Finvite%3D${encodeURIComponent(inviteToken)}` : ""}`);
  }

  const service = createSupabaseServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .eq("is_guest", false)
    .maybeSingle();

  if (profile) {
    redirect(inviteToken ? `/join/${inviteToken}` : "/home");
  }

  return (
    <MobileShell showNav={false}>
      <section className="flex min-h-[calc(100dvh-64px)] flex-col justify-end pb-40">
        <Card>
          <CardContent className="p-6">
            <OnboardingForm inviteToken={inviteToken} />
          </CardContent>
        </Card>
      </section>
    </MobileShell>
  );
}
