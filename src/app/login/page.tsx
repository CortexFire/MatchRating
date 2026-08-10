import { Trophy } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { MobileShell } from "@/components/app/mobile-shell";
import { Card, CardContent } from "@/components/ui/card";
import { getSafeAuthNextPath } from "@/lib/auth/next-path";

const AUTH_CALLBACK_FAILURE_MESSAGE =
  "That sign-in link is invalid or expired. Request a new link or enter the six-digit email code.";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const params = searchParams ? await searchParams : {};

  return (
    <MobileShell showNav={false}>
      <section className="flex min-h-[calc(100dvh-40px)] flex-col justify-center gap-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-lg bg-action text-white">
            <Trophy className="size-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-8">Badminton Rankings</h1>
          </div>
        </div>
        <Card>
          <CardContent className="p-4">
            <LoginForm
              initialMessage={params.error === "auth_callback_failed" ? AUTH_CALLBACK_FAILURE_MESSAGE : undefined}
              initialNextPath={getSafeAuthNextPath(params.next)}
            />
          </CardContent>
        </Card>
      </section>
    </MobileShell>
  );
}
