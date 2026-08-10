const DEFAULT_PUBLIC_SITE_ORIGIN = "http://localhost:3000";

export function getTrustedPublicSiteOrigin() {
  return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_PUBLIC_SITE_ORIGIN).origin;
}
