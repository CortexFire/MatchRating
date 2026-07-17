# Supabase Auth Setup

The login screen supports Google's prebuilt Sign in with Google button and email one-time codes through Supabase Auth.

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

## Google Provider

1. In Google Auth Platform, create a Web application OAuth client.
2. Add `http://localhost:3000` and the production origin as Authorized JavaScript origins.
3. Add the Supabase callback shown on the Supabase Google provider page as an Authorized redirect URI.
4. Keep the app in external testing and add the intended Google accounts as test users until production rollout.
5. Enable Google in Supabase Auth and configure the OAuth client ID and secret.

The browser may receive the client ID through `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. Keep the client secret only in Google Cloud and Supabase; never commit it or expose it through a `NEXT_PUBLIC_` variable.

## Email Code Template

For one-time-code entry, update the Supabase email template to include `{{ .Token }}`. You may also include the confirmation link that uses `{{ .ConfirmationURL }}` so users can sign in by link if they prefer.
