import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  getRequiredSupabasePublicEnv,
  getRequiredSupabaseSecretKey,
} from "./env";

export async function createSupabaseServerClient() {
  const env = getRequiredSupabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies. Server Actions and route handlers can.
        }
      },
    },
  });
}

export function createSupabaseServiceClient() {
  const env = getRequiredSupabasePublicEnv();
  return createClient(env.url, getRequiredSupabaseSecretKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function requireUserId() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    throw new Error("You must be signed in to do that.");
  }

  return data.claims.sub;
}
