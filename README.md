# CyberHx_ShadowCopy

CyberHX CTF platform — final hardened build (v3). A React + Vite frontend backed by
Supabase (Postgres + RLS + Auth) with Edge Functions handling server-side flag
validation and scoreboard aggregation.

## Structure

```
docs/
  SETUP.md                      Full deployment + security hardening guide
frontend/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  vercel.json                   Security headers (CSP, HSTS, X-Frame-Options)
  public/                       robots.txt, sitemap.xml, site.webmanifest
  src/
    main.tsx                    App entry
    App.tsx                     Main application shell
    Scoreboard.tsx
    Settings.tsx
    SharedComponents.tsx
    TeamProfile.tsx
    TeamsList.tsx
    UserProfile.tsx
    UsersList.tsx
    types.ts
    index.css
    api/submitFlag.ts           Client wrapper for the submit-flag Edge Function
    components/AuthPage.tsx
    components/admin/AdminDashboard.tsx
    hooks/useAuth.ts
    hooks/useData.ts
    lib/supabase.ts             Supabase client
supabase/
  config.toml                   CLI project ref
  migrations/                   Tables, RLS policies, views, triggers, RPCs
  functions/submit-flag/        Server-side flag check + rate limiting
  functions/scoreboard/         Scoreboard aggregation
```

## Quick start

```bash
cd frontend
cp .env.example .env     # then fill in your Supabase project values
npm install
npm run dev              # http://localhost:3000
```

Other scripts: `npm run build`, `npm run preview`, `npm run lint` (`tsc --noEmit`),
`npm run clean`.

## Environment variables

`frontend/.env` is git-ignored. Copy `frontend/.env.example` and set:

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon / publishable key |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key (CAPTCHA) |

## Deployment

See [`docs/SETUP.md`](docs/SETUP.md) for the full sequence: creating the Supabase
project, applying `supabase/migrations/`, configuring Auth (email confirmation,
Google OAuth, Turnstile), deploying the Edge Functions with `ALLOWED_ORIGINS`,
deploying the frontend to Vercel, and the Cloudflare WAF rules. It also lists the
verification curl commands that must fail for anon access and role escalation.

## Continuous deployment to Supabase

`.github/workflows/deploy-supabase.yml` applies migrations and redeploys both
Edge Functions whenever anything under `supabase/` lands on `main`.

It needs two repository secrets (Settings → Secrets and variables → Actions):

| Secret | Where to get it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens |
| `SUPABASE_DB_PASSWORD` | The database password set when the project was created |

Because the initial schema was applied by hand before this workflow existed, the
database has no record of that migration. Mark it as applied once, so `db push`
does not try to re-run it against tables that already exist:

```bash
supabase migration repair --status applied 20260825000000
```
