import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthCallbackIntentCookie, matchesAuthCallbackIntent } from "@/lib/auth/callback-intent";
import { getSafeAuthNextPath } from "@/lib/auth/next-path";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CALLBACK_ERROR_PATH = "/login?error=auth_callback_failed";

function responseWithClearedIntent(url: URL, cookie: ReturnType<typeof getAuthCallbackIntentCookie>) {
  const response = NextResponse.redirect(url);
  response.cookies.set({ ...cookie, value: "", maxAge: 0 });
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const nextPath = getSafeAuthNextPath(requestUrl.searchParams.get("next"));

  if (!code && tokenHash && type) {
    const cookie = getAuthCallbackIntentCookie(requestUrl.protocol === "https:");
    const storedIntent = (await cookies()).get(cookie.name)?.value ?? "";
    const callbackIntent = requestUrl.searchParams.get("auth_intent") ?? "";
    if (!matchesAuthCallbackIntent(storedIntent, callbackIntent)) {
      return NextResponse.redirect(new URL(CALLBACK_ERROR_PATH, requestUrl));
    }

    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      } as Parameters<typeof supabase.auth.verifyOtp>[0]);

      if (error) {
        throw error;
      }

      return responseWithClearedIntent(new URL(nextPath, requestUrl), cookie);
    } catch {
      return responseWithClearedIntent(new URL(CALLBACK_ERROR_PATH, requestUrl), cookie);
    }
  }

  try {
    if (code) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

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
