# Deploying Chronos to Railway

Chronos is a single long-lived Bun + Effect process: an HTTP API, a 1-second
ticker (`@effect/cluster` `Singleton`), and durable workflows. The Vite
dashboard in `web/` is **built into the same service** and served on the same
origin, so auth cookies stay first-party (no CORS).

```
Railway project
├─ Postgres (plugin)              -> provides DATABASE_URL
└─ chronos (one service)          -> Dockerfile, single replica
   ├─ Bun serves /api/*           -> Effect HttpRouter
   └─ Bun serves /*               -> web/dist (SPA fallback, src/static/http.ts)
```

## 1. Create the project

```sh
# one-time
bun add -g @railway/cli      # or: brew install railway
railway login
railway init                 # create / link a project
```

Add Postgres in the Railway dashboard: **New → Database → PostgreSQL**.

## 2. Configure the service

The repo ships a `Dockerfile` and `railway.json`, so Railway builds from the
Dockerfile automatically (single replica, health check on `/health`).

Set these variables on the **chronos** service (Variables tab):

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{ Postgres.DATABASE_URL }}` (reference the plugin) |
| `BETTER_AUTH_SECRET` | output of `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | the service's public URL, e.g. `https://chronos-production.up.railway.app` |
| `TRUSTED_ORIGINS` | same value as `BETTER_AUTH_URL` |

`PORT` is injected by Railway — do not set it. `RUNNER_HOST` / `RUNNER_PORT`
defaults are correct for a single replica.

> Generate the public domain first (**Settings → Networking → Generate Domain**)
> so you know the URL to put in `BETTER_AUTH_URL` / `TRUSTED_ORIGINS`.

## 3. One-time database setup

These tables are **not** created automatically and must be run once against the
Railway database (`cluster_*` tables auto-create on first boot, so they're not
listed here). `railway run` injects the service's env (incl. `DATABASE_URL`)
into a local command:

```sh
# Better Auth tables: user / session / account / verification
railway run bunx @better-auth/cli migrate

# App tables: jobs / job_runs / notifications
railway run bun run db:push
```

## 4. Deploy

```sh
railway up        # build + deploy from the current directory
```

Then open the public URL — the dashboard loads, and `/health` should report
`{"ok":true,"db":"up"}`.

## Notes & gotchas

- **Single replica only.** The ticker is a cluster `Singleton` with one runner
  (`RUNNER_HOST`/`RUNNER_PORT`). Scaling to multiple replicas requires real
  cluster networking (Railway private networking + per-runner addressing) and
  is not configured here.
- **Bash jobs run inside the container.** `bash`-mode jobs execute shell in the
  service container (the `oven/bun` image includes bash). The container is the
  sandbox — be deliberate about what scripts you let users schedule.
- **Cookies are first-party** because the SPA is served from the same origin as
  the API. If you ever split the frontend into its own service, you'll need
  CORS + `SameSite=None; Secure` cookies and a `VITE_API_URL` base.
- **Local parity:** `docker compose up -d postgres` then `bun run dev` (backend)
  and `cd web && bun run dev` (Vite on :5173, proxying /api to :3000).
