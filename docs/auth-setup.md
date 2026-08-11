# Supabase Auth Setup

The login screen supports Google's prebuilt Sign in with Google button and email login links through Supabase Auth.

## Environment

Set these public values locally and in the deployment environment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `NEXT_PUBLIC_SITE_URL` (`http://localhost:3000` locally and the production origin when deployed)

## Redirect URLs

Add these redirect URLs in Supabase Auth settings:

- Local: `http://localhost:3000/auth/confirm`
- Production: `https://<your-production-domain>/auth/confirm`

Email auth links use `/auth/confirm`, which exchanges Supabase callback parameters for a server session and redirects to the safe in-app `next` path. Google sign-in uses an ID token directly and does not use this route.

## Email Link Behavior

Email sign-in links are bound to the browser that requested them for one hour. Requesting another link replaces the browser intent, so only the latest link can be used in that browser during the one-hour window. Open the link in the same browser that requested it. If the link is opened elsewhere or has expired, return to the login screen in the intended browser and request a new link.

## Google Provider

1. In Google Auth Platform, create a Web application OAuth client.
2. Add `http://localhost:3000` and the production origin as Authorized JavaScript origins.
3. Add the Supabase callback shown on the Supabase Google provider page as an Authorized redirect URI.
4. Keep the app in external testing and add the intended Google accounts as test users until production rollout.
5. Enable Google in Supabase Auth and configure the OAuth client ID and secret.

The browser may receive the client ID through `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. Keep the client secret only in Google Cloud and Supabase; never commit it or expose it through a `NEXT_PUBLIC_` variable.

## Dormant Email OTP Support

The server retains an email-only `verifyEmailOtp` action for a possible future code-entry flow, but the current login screen does not expose code entry. Enabling email codes later would require adding `{{ .Token }}` to the Supabase email template and restoring a code-entry interface.

This dormant email verifier is not a ready-made cell-phone flow. SMS verification would require separate phone-number collection plus phone-specific OTP request and verification handling.
