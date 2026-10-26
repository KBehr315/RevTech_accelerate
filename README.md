# Accelerate: SAP GovCon Training Platform

A multi-client platform for consultancies supporting aerospace and defense and
other government contractors on SAP S/4HANA, Fiori and Dassian. It combines
three components: an enterprise knowledge library, an AI training content
generator, and a learning management system. Every client's data is isolated by
Postgres row-level security.

The design and roadmap are in [docs/platform/](docs/platform/README.md). Phase 0
(identity, client workspaces, roles, audit) is what's built so far.

Live at https://accelerate.revtech.consulting (Azure, Operations Applications subscription).

## Stack

- `web/` — React 19 + Vite + TypeScript + Tailwind (frontend). Signs in with
  Microsoft (MSAL) and queries the database with `@supabase/postgrest-js`.
- `server/` — Express server (TypeScript, run directly by Node 24 with type
  stripping) that serves `web/dist` and the API. It verifies the caller's
  Microsoft ID token, then forwards database requests to PostgREST with a
  short-lived JWT naming the caller's profile, so the RLS policies decide what
  they can see. `server/migrate.js` applies the migrations.
- `db/migrations/` — SQL schema, RLS policies, and security-definer commands,
  applied in filename order. `00000` recreates the few Supabase built-ins
  (`auth.users`, `auth.uid()`, the `authenticated` role); `00100` onward is the
  platform. The retired compliance LMS's migrations are in `archive/`.
- `db/tests/` — runs every migration in PGlite (Postgres in WebAssembly) and
  tests isolation between clients for every role.
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

## Signing in and roles

RevTech staff sign in with their Microsoft account; client users are invited as
B2B guests of the RevTech tenant and sign in the same way. Signing in creates a
profile with no access: people see a client only once a Client Training or LMS
Administrator adds them to it. Ryan Euler and Kelly Behringer are seeded as
Platform Administrators by `00100`. Platform roles never grant access to client
content by themselves.

## Deploying

Every push to `master` runs `.github/workflows/deploy-azure.yml`: it runs the
database tests, server typecheck and web lint, builds the image in the
registry, runs the migrations job, then rolls the app onto the new image. The Azure ids in the workflow are not secrets; the login works through a
federated credential on `id-accelerate-deploy` trusted only for this repo's
`master` branch.

## Local development

```bash
npm install          # root: server and database tests
npm test             # RLS and isolation tests, no database server needed
npm run typecheck    # server

cd web
npm install
npm run dev
```

There is no local database. The dev server proxies `/api` to the deployed app
(set `API_PROXY_TARGET` to point it elsewhere), and you sign in with your own
Microsoft account, so you see what you'd see in production.
