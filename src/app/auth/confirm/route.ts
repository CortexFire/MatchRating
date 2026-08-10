import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getAuthCallbackIntentCookie,
  getAuthCallbackIntentCookieForTrustedPublicSite,
  matchesAuthCallbackIntent,
} from "@/lib/auth/callback-intent";
import { getSafeAuthNextPath } from "@/lib/auth/next-path";
import { getTrustedPublicSiteOrigin } from "@/lib/auth/public-site-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CALLBACK_ERROR_PATH = "/login?error=auth_callback_failed";

function responseWithClearedIntent(url: URL, cookie: ReturnType<typeof getAuthCallbackIntentCookie>) {
  const response = NextResponse.redirect(url);
  response.cookies.set({ ...cookie, value: "", maxAge: 0 });
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const publicSiteOrigin = getTrustedPublicSiteOrigin();
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const nextPath = getSafeAuthNextPath(requestUrl.searchParams.get("next"));

  if (!code && !(tokenHash && type)) {
    return NextResponse.redirect(new URL(CALLBACK_ERROR_PATH, publicSiteOrigin));
  }

  const cookie = getAuthCallbackIntentCookieForTrustedPublicSite();
  const storedIntent = (await cookies()).get(cookie.name)?.value ?? "";
  const callbackIntent = requestUrl.searchParams.get("auth_intent") ?? "";
  if (!matchesAuthCallbackIntent(storedIntent, callbackIntent)) {
    return NextResponse.redirect(new URL(CALLBACK_ERROR_PATH, publicSiteOrigin));
  }

  try {
    const supabase = await createSupabaseServerClient();
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        throw error;
      }
    } else {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash!,
        type: type!,
      } as Parameters<typeof supabase.auth.verifyOtp>[0]);

      if (error) {
        throw error;
      }
    }

    return responseWithClearedIntent(new URL(nextPath, publicSiteOrigin), cookie);
  } catch {
    return responseWithClearedIntent(new URL(CALLBACK_ERROR_PATH, publicSiteOrigin), cookie);
  }
}
