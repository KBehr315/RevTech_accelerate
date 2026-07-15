# Compliance Training LMS

A learning management system for tracking mandatory, scored training across the
organization. Employees see what's assigned to them, their score history, and
when each training needs to be renewed. Admins author or link training content,
attach a quiz, and assign it to employees.

## Stack

- `web/` — React 19 + Vite + TypeScript + Tailwind + Supabase (frontend)
- `api/` — Vercel serverless functions (admin-only operations that need the
  Supabase service-role key, currently just employee invites)
- `supabase/migrations/` — SQL schema, RLS policies, and scoring RPCs

## First-time setup

### 1. Create a Supabase project

Create a new project at [supabase.com](https://supabase.com), then grab from
**Settings → API**:
- Project URL
- `anon` public key
- `service_role` secret key (server-only, never put this in the frontend)

### 2. Run the migrations

Open the Supabase SQL editor and run, in order:
1. `supabase/migrations/00001_initial_schema.sql`
2. `supabase/migrations/00002_rls_policies.sql`

### 3. Configure environment variables

```bash
cp web/.env.example web/.env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

cp .env.example .env
# fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
# (these three also need to be set in the Vercel project's env vars once deployed)
```

### 4. Create the first admin

There's a chicken-and-egg problem: only admins can invite employees through the
app, so the very first admin has to be created directly:

1. In the Supabase dashboard, go to **Authentication → Users → Add user** and
   create an account for yourself (email + password). This fires a trigger
   that auto-creates a matching `profiles` row with `role = 'employee'`.
2. In the SQL editor, promote yourself:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@company.com';
   ```
3. Sign in at `/login` with that account — you'll land in the admin dashboard.

From here on, invite every other employee (admins included) through
**Employees → Invite Employee** in the app.

### 5. Install and run

```bash
cd web
npm install
npm run dev
```

The invite-employee flow calls `/api/invite-employee`, which only exists when
running through Vercel. For local testing of that specific feature, use
`vercel dev` from the repo root instead of `npm run dev`; for everything else
(modules, quizzes, assignments, reports), `npm run dev` in `web/` is enough.

## Deploying

This repo is one Vercel project: `vercel.json` builds `web/` as the static
frontend (`web/dist`) and auto-detects `api/*.ts` as serverless functions. Set
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in the
Vercel project's environment variables (the service role key must be a
**server-only** env var, not one prefixed `VITE_`), plus `VITE_SUPABASE_URL`
and `VITE_SUPABASE_ANON_KEY` for the frontend build.

## What's deliberately not in v1

- **No SCORM runtime.** Linked/embedded content is an iframe embed or a
  "open in a new tab" link, gated by a manual "mark as viewed" step before the
  quiz unlocks — not a real SCORM 1.2/2004 JS API. Our own quiz is the system
  of record for scoring, not the embedded package's internal tracking.
- **No email reminders.** Due/overdue status is visible in the app (employee
  landing page + admin compliance report) but nothing emails people yet.
- **No CSV import/export.**
- **No automated renewal cron.** Renewal status is computed on read from the
  latest attempt + the module's renewal period — retaking the same
  assignment's quiz is how a renewal cycle gets closed out.

## Quality gates before deploying

```bash
cd web
npx tsc -b --noEmit   # type check
npm run build         # production build
npm run lint          # eslint, zero warnings
```
