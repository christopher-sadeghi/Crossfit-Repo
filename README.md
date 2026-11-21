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
