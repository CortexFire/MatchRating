import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_AUTH_REDIRECT_PATH = "/groups/new";
const CALLBACK_ERROR_PATH = "/login?error=auth_callback_failed";

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_AUTH_REDIRECT_PATH;
  }

  return value;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const nextPath = getSafeNextPath(requestUrl.searchParams.get("next"));
  const supabase = await createSupabaseServerClient();

  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        throw error;
      }
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      } as Parameters<typeof supabase.auth.verifyOtp>[0]);

      if (error) {
        throw error;
      }
    } else {
      throw new Error("Missing auth callback parameters.");
    }

    return NextResponse.redirect(new URL(nextPath, requestUrl));
  } catch {
    return NextResponse.redirect(new URL(CALLBACK_ERROR_PATH, requestUrl));
  }
}
