import { Trophy } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { MobileShell } from "@/components/app/mobile-shell";
import { Card, CardContent } from "@/components/ui/card";

function safeNextPath(value?: string | string[]) {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/onboarding";
  }

  return next;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string | string[] }>;
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
            <p className="mt-2 text-sm leading-5 text-muted">
              Track matches, confirm scores, and keep every group rating isolated.
            </p>
          </div>
        </div>
        <Card>
          <CardContent className="p-4">
            <LoginForm initialNextPath={safeNextPath(params.next)} />
          </CardContent>
        </Card>
      </section>
    </MobileShell>
  );
}
