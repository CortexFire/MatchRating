# Supabase Auth Setup

The login screen supports Google OAuth and email one-time codes through Supabase Auth. Configure the Supabase project before testing these flows against a real backend.

## Redirect URLs

Add these redirect URLs in Supabase Auth settings:

- Local: `http://localhost:3000/auth/confirm`
- Production: `https://<your-production-domain>/auth/confirm`

The app sends both Google OAuth and email auth links to `/auth/confirm?next=/groups/new`. The route exchanges Supabase callback parameters for a server session, then redirects to the safe in-app `next` path.

## Google Provider

Enable the Google provider in Supabase Auth and configure the Google OAuth client ID and secret in the Supabase dashboard. Keep provider secrets in Supabase or deployment environment settings; do not commit them to this repository.

## Email Code Template

For one-time-code entry, update the Supabase email template to include `{{ .Token }}`. You may also include the confirmation link that uses `{{ .ConfirmationURL }}` so users can sign in by link if they prefer.
