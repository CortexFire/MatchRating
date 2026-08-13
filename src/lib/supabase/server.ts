import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";
import {
  getRequiredSupabasePublicEnv,
  getRequiredSupabaseSecretKey,
} from "./env";
import { createPostgrestFutureJwtRetryFetch } from "./retry-fetch";

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
    global: {
      fetch: createPostgrestFutureJwtRetryFetch(fetch),
    },
  });
}

export const requireAuthenticatedSupabaseClient = cache(async () => {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getClaims();

  if (error || !data?.claims?.sub) {
    throw new Error("You must be signed in to do that.");
  }

  return { client, userId: data.claims.sub };
});

export const requireUserId = cache(async () => (
  await requireAuthenticatedSupabaseClient()
).userId);
