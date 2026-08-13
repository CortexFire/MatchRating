import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <AuthRedirect />
    </Suspense>
  );
}

export async function AuthRedirect() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  redirect(error || !data?.claims?.sub ? "/login" : "/home");
  return null;
}
