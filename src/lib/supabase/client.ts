"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getRequiredSupabasePublicEnv } from "./env";

export function createSupabaseBrowserClient() {
  const env = getRequiredSupabasePublicEnv();
  return createBrowserClient(env.url, env.publishableKey);
}
