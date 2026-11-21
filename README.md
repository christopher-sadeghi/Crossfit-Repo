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
