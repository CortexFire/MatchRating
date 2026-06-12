export function getSupabasePublicEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function isSupabaseConfigured() {
  const env = getSupabasePublicEnv();
  return Boolean(env.url && env.publishableKey);
}

export function getRequiredSupabasePublicEnv() {
  const env = getSupabasePublicEnv();

  if (!env.url || !env.publishableKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return env as { url: string; publishableKey: string };
}

export function getRequiredSupabaseSecretKey() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error("Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY for trusted server writes.");
  }

  return key;
}
