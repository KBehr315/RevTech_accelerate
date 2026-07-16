# Compliance Training LMS

A learning management system for tracking mandatory, scored training across the
organization. Employees see what's assigned to them, their score history, and
when each training needs to be renewed. Admins author or link training content,
attach a quiz, and assign it to employees.

## Stack

- `web/` — React 19 + Vite + TypeScript + Tailwind + Supabase (frontend)
- `supabase/migrations/` — SQL schema, RLS policies, and scoring RPCs
- Auth is Microsoft Entra ID (Azure AD) SSO via Supabase Auth — no passwords,
  no invite emails. Anyone who can sign into your Azure AD tenant gets an
  account automatically on first login.

## First-time setup

### 1. Create a Supabase project

Create a new project at [supabase.com](https://supabase.com), then grab from
**Settings → API**: Project URL and the `anon`/`publishable` key.

### 2. Run the migrations

Open the Supabase SQL editor and run every file in `supabase/migrations/` in
order (`00001` through `00006` as of this writing — check the directory for
the current last number).

### 3. Register an app in Azure AD (Microsoft Entra ID)

1. [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID** →
   **App registrations** → **New registration**.
2. Name it anything (e.g. "Compliance Training LMS"). Supported account
   types: **Accounts in this organizational directory only** (single tenant)
   for an internal tool.
3. **Redirect URI**: platform **Web**, value:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
4. After creating it, copy the **Application (client) ID** and **Directory
   (tenant) ID** from the Overview page.
5. **Certificates & secrets** → **New client secret** → copy the secret
   **value** immediately (it's only shown once).

### 4. Enable the Azure provider in Supabase

**Authentication → Providers → Azure** in the Supabase dashboard: enable it,
paste the Client ID, Client Secret, and Azure Tenant URL
(`https://login.microsoftonline.com/<tenant-id>/v2.0`).

### 5. Configure environment variables

```bash
cp web/.env.example web/.env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

### 6. Create the first admin

1. Go to `/login` and sign in with **Sign in with Microsoft** using your own
   work account. This auto-creates your `profiles` row with `role = 'employee'`.
2. In the Supabase SQL editor, promote yourself:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@company.com';
   ```
3. Refresh — you'll land in the admin dashboard.

Every other employee just needs to sign in once with their own Microsoft
account to get an account; promote additional admins the same way, or from
**Employees → Make admin** in the app.

### 7. Install and run

```bash
cd web
npm install
npm run dev
```

## Deploying

`vercel.json` builds `web/` as a static frontend (`web/dist`). Set
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel project's
environment variables.

## What's deliberately not in v1

- **No SCORM runtime.** Linked/embedded content is an iframe embed or a
  "open in a new tab" link, gated by a manual "mark as viewed" step before the
  quiz unlocks — not a real SCORM 1.2/2004 JS API. Our own quiz is the system
  of record for scoring, not the embedded package's internal tracking.
- **No email reminders.** Due/overdue status is visible in the app (employee
  landing page + admin dashboard) but nothing emails people yet.
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
