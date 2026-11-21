# FitCoach AI

A coach-facing web app for CrossFit coaches: athletes, WODs, results, macro nutrition, goals, and AI suggestions the coach approves.

Stack: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Supabase, deployed on Vercel.

## Local setup

1. Install Node.js 22.
2. `npm install`
3. Copy `.env.example` to `.env.local` and fill in the Supabase URL and publishable key.
4. `npm run dev` and open http://localhost:3000

## Scripts

- `npm run dev` – start the dev server
- `npm run build` – production build
- `npm run lint` – lint

## Database

The database schema lives in `supabase/migrations/` and is applied in filename order:

- `20261121000000_initial_schema.sql`: all tables, relationships, and row-level security (each coach only sees their own data).
- `20261121000100_seed_movement_library.sql`: 62 starter movements shared by all coaches.

`supabase/tests/rls_isolation.sql` checks that one coach cannot read or change another coach's data. It runs in a transaction and rolls back.

TypeScript types for the tables are in `src/lib/supabase/database.types.ts`. Regenerate them after schema changes:

```bash
npx supabase gen types typescript --project-id <project-ref> --schema public > src/lib/supabase/database.types.ts
```

## Authentication

Coaches sign up and log in with email and password (Supabase Auth). Logged-out visitors are redirected to `/login` by `src/middleware.ts`.

Emails for confirming sign-up and resetting a password link to `/auth/callback`. In Supabase, open **Authentication > URL Configuration** and add these redirect URLs:

- `http://localhost:3000/**` for local development.
- Your production domain and this project's own preview pattern, for example `https://fitcoach-*-<your-vercel-team>.vercel.app/**`, once deploys are set up. Never allow all of `https://*.vercel.app/**`: anyone can deploy there, so reset links could be sent to someone else's site.

Before launch, set up custom SMTP (for example Resend) under **Authentication > Emails**: Supabase's built-in sender only emails your Supabase team members, a few per hour, and templates can't be edited without custom SMTP. Then make the links verify on our server instead of relying on a cookie from the browser that requested them (otherwise a reset link opened on another device or browser fails). Replace the link in these two templates:

- **Confirm signup**: `<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Confirm your email</a>`
- **Reset Password**: `<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery">Reset your password</a>`

`{{ .RedirectTo }}` is the `/auth/callback?next=...` URL the app sends, so it must be in the redirect list above.
