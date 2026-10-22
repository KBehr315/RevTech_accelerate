# Compliance Training LMS

A learning management system for tracking mandatory, scored training across the
organization. Employees see what's assigned to them, their score history, and
when each training needs to be renewed. Admins author or link training content,
attach a quiz, and assign it to employees.

Live at https://accelerate.revtech.consulting (Azure, Operations Applications subscription).

## Stack

- `web/` — React 19 + Vite + TypeScript + Tailwind (frontend). Signs in with
  Microsoft (MSAL) and queries the database with `@supabase/postgrest-js`.
- `server/` — Express server that serves `web/dist` and the API. It verifies the
  caller's Microsoft ID token, then forwards database requests to PostgREST with
  a short-lived JWT naming the caller's profile, so the RLS policies decide what
  they can see. `server/migrate.js` applies the migrations.
- `db/migrations/` — SQL schema, RLS policies, and scoring RPCs, applied in
  filename order. `00000` recreates the few Supabase built-ins (`auth.users`,
  `auth.uid()`, the `authenticated` role) that `00001`–`00005` were written against.
- `infra/provision.sh` — one-time Azure setup. Deploys after that are the
  GitHub Actions workflow.

## How it runs in Azure

The same layout as RevelationHub, sharing its Container Apps environment,
Postgres server and container registry in `rg-revhub-preview`. Everything this
app owns is in `rg-accelerate-preview`.

| Resource | What it is |
|---|---|
| `ca-accelerate-preview` | This repo's image: frontend + API. The only public entry point. |
| `ca-accelerate-pgrst-preview` | PostgREST, internal ingress only. Rejects requests without a JWT signed by the API server. |
| `caj-accelerate-migrate` | Container Apps job running `node server/migrate.js` from the same image. |
| `psql-revhub-preview-ad4fad06` / `accelerate` | The database, on RevelationHub's Postgres server (private network only). |
| `kv-accelerate-0ae49a` | Secrets: PostgREST JWT secret and connection strings. |
| `id-accelerate-preview` | Managed identity the apps use for Key Vault and image pulls. |
| `id-accelerate-deploy` | Identity GitHub Actions signs in as (OIDC, no stored secret). |
| Entra app "RevTech Accelerate" | Sign-in. Client id is in `web/.env.production`. |

## Signing in and admins

Anyone in the RevTech tenant can sign in with their Microsoft account. The first
sign-in creates an employee profile; there is no invite step. Ryan Euler and
Kelly Behringer are seeded as admins by `00006_entra_sign_in.sql` and can promote
others from **Employees**. Deactivated employees can't sign in.

## Deploying

Every push to `main` runs `.github/workflows/deploy-azure.yml`: it builds the
image in the registry, runs the migrations job, then rolls the app onto the new
image. The Azure ids in the workflow are not secrets; the login works through a
federated credential on `id-accelerate-deploy` trusted only for this repo's
`main` branch.

## Local development

```bash
cd web
npm install
npm run dev
```

There is no local database. The dev server proxies `/api` to the deployed app
(set `API_PROXY_TARGET` to point it elsewhere), and you sign in with your own
Microsoft account, so you see what you'd see in production.

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
