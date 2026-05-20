# Chronos

A distributed job scheduler. Submit one-time or recurring jobs that fire as **webhook calls** or **sandboxed bash scripts**, with durable execution, automatic retries, full per-run logs, and in-app notifications when retries are exhausted.

Built for the Airtribe Backend Engineering Launchpad case study.

> See [`PRD.md`](./PRD.md) for the design doc — architecture diagram, data model, full execution flow, and the decisions log.

## Stack

| Layer | Choice |
|---|---|
| Runtime | Bun |
| Language | TypeScript (strict) |
| Effect system | `effect@3.x` — typed errors, layered DI, schedules for retry |
| Durable workflows | `@effect/workflow` + `@effect/cluster` (single-runner cluster on Postgres) |
| DB | Postgres 16 (Docker) |
| ORM | Drizzle ORM `1.0-beta` via `drizzle-orm/effect-postgres` adapter |
| HTTP server | `@effect/platform-bun` HttpServer |
| Auth | Better Auth (email + password) |
| Sandbox (bash mode) | `just-bash` — in-process virtual filesystem with network allowlist |
| Cron parser | `croner` |
| Frontend | Vite + React 19 + TypeScript + Tailwind v4 + TanStack Query + React Router + shadcn (`@jalco` registry components) |

## Quick start

Prerequisites: **Bun ≥ 1.3**, **Docker Desktop**.

```bash
# 1. install deps
bun install
cd web && bun install && cd ..

# 2. start Postgres
bun run db:up

# 3. apply our domain schema (jobs/job_runs/notifications)
bun run db:push

# 4. apply Better Auth schema (user/session/account/verification)
bunx @better-auth/cli@latest migrate --config src/auth/better-auth.ts --yes

# 5. run the backend
bun run dev               # http://localhost:3000

# 6. (separate terminal) run the dashboard
cd web && bun dev         # http://localhost:5173 — Vite proxies /api/* to :3000
```

Default Postgres credentials live in `.env.example`. Copy to `.env`:

```bash
cp .env.example .env
# then generate a session secret:
openssl rand -base64 32  # paste into BETTER_AUTH_SECRET
```

The `@effect/cluster` workflow storage tables (`cluster_messages`, `cluster_runners`, etc.) self-bootstrap on first server boot — no manual step needed.

## Architecture in one paragraph

A **ticker fiber** polls Postgres every second for jobs whose `next_run_at <= now()`, claiming them with `SELECT ... FOR UPDATE SKIP LOCKED` (so multiple ticker nodes could safely share the load). Each claimed job becomes a **workflow execution** via `@effect/cluster`'s `ClusterWorkflowEngine`, which persists workflow state in Postgres — so a process crash mid-execution resumes from the last activity boundary. The workflow body runs the actual work (HTTP fetch or `just-bash` exec), retries internally with exponential backoff + jitter, and on terminal failure inserts a `notifications` row that the UI polls every 30 seconds.

```
┌─────────────┐      ┌────────────────────────────────────────┐
│  Vite SPA   │ HTTP │ Bun process                            │
│  (web/)     │─────▶│  HTTP API  →  Better Auth, jobs CRUD,  │
└─────────────┘      │              runs/notifications reads  │
                     │  Ticker fiber → claims due jobs        │
                     │  Workflow runtime → durable execution  │
                     └──────────────┬─────────────────────────┘
                                    │
                                    ▼
                            ┌──────────────┐
                            │  Postgres    │
                            │  (Docker)    │
                            └──────────────┘
```

## API at a glance

All `/api/jobs/*`, `/api/runs/*`, `/api/notifications/*` routes require a Better Auth session cookie. The dashboard's **/api-ref** page renders these tables interactively with type-coloured props (powered by the `@jalco/api-ref-table` component).

| Method | Path | Purpose |
|---|---|---|
| ALL | `/api/auth/*` | Better Auth (sign-up, sign-in, sign-out, session) |
| POST | `/api/jobs` | Create job |
| GET | `/api/jobs` | List user's jobs (paginated) |
| GET | `/api/jobs/:id` | Job detail |
| PATCH | `/api/jobs/:id` | Edit — name, payload, schedule, retry policy, pause/active |
| DELETE | `/api/jobs/:id` | Cancel + delete (cascades to runs + notifications) |
| POST | `/api/jobs/:id/run` | Manually trigger now |
| GET | `/api/jobs/:id/runs` | Run history |
| GET | `/api/runs/:id` | Run detail with full logs |
| GET | `/api/notifications` | List notifications, `?unseenOnly=true` filter |
| GET | `/api/notifications/unseen-count` | For the UI badge |
| POST | `/api/notifications/:id/seen` | Mark as read |

### Request shapes

**Create a one-time webhook job:**

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" -b cookies.txt \
  -d '{
    "name": "ping httpbin",
    "payload": {
      "kind": "webhook",
      "url": "https://httpbin.org/get",
      "method": "GET"
    },
    "schedule": { "runAt": "2026-05-20T14:00:00Z" }
  }'
```

**Create a recurring bash job:**

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" -b cookies.txt \
  -d '{
    "name": "daily report",
    "payload": {
      "kind": "bash",
      "script": "echo hello | tr a-z A-Z",
      "timeoutMs": 30000,
      "allowedUrls": []
    },
    "schedule": { "cron": "0 9 * * *" },
    "retryPolicy": { "maxAttempts": 3, "baseMs": 1000, "maxMs": 60000, "jitter": true }
  }'
```

## Key design decisions

These are the calls worth flagging in a code review. Reasoning lives in [`PRD.md`](./PRD.md) §12.

1. **Effect Workflow as the durable execution primitive, not a hand-rolled retry loop.** Retries, state survival across crashes, and idempotency are exactly what workflow engines exist to solve. Building them by hand would reimplement well-trodden ground.
2. **Job-row + workflow-per-execution model, NOT one long-lived looping workflow per job.** The case study describes a *scheduler* (users manage jobs, view runs, reschedule). A `jobs` row driving a per-tick workflow maps cleanly to that user-facing model. Cleaner cancel + reschedule semantics.
3. **Postgres with `FOR UPDATE SKIP LOCKED`, not SQLite.** Lets multiple ticker nodes safely claim disjoint subsets of due jobs without leader election. Supports an honest "distributed" claim in the writeup.
4. **`just-bash` for shell jobs, not Docker-per-job.** In-process virtual FS, no container spin-up cost (~100ms saved per execution), no Docker daemon dependency, network defaults off with per-job allowlist. Real isolation without extra ops surface.
5. **Better Auth, not hand-rolled JWT.** Owns its own tables in Postgres, plays with Bun, sessions + cookies + CSRF handled out of the box. ~20 lines of glue to wrap into an Effect `Auth.requireUser` service.
6. **Drizzle ORM 1.0-beta via `effect-postgres`, layered on top of `@effect/sql-pg`.** Type-safe queries (refactor safety, IDE autocomplete), shared connection pool, `drizzle-kit push` for schema sync. Beta channel — the adapter only exists on 1.0-beta.

## What's not built (intentional)

- Email / SMS notifications (in-app DB-table notifications only)
- OAuth / magic links / passkeys / 2FA
- Per-attempt run rows — retries happen internally inside the workflow; one `job_runs` row per workflow execution captures the final outcome
- Multi-tenant orgs / role-based auth — per-user scoping only
- Job dependencies / DAGs / fan-out
- Horizontal autoscaling of workers — architecture supports it (FOR UPDATE SKIP LOCKED), ops not wired

## Operating notes / gotchas

- **Don't use `bun --hot` with this app.** `@effect/cluster`'s message processor captures references during layer construction, so partial reloads leave the cluster engine in an inconsistent state where workflows register but no live worker picks them up. The `dev` script uses `bun --watch` (full restart) for that reason.
- **Cluster owns its schema.** Don't try to manage `cluster_*` tables with `drizzle-kit`. The `tablesFilter` in `drizzle.config.ts` scopes drizzle-kit to our owned tables only (`jobs`, `job_runs`, `notifications`).
- **Better Auth runs its config under `process.env`, not `Bun.env`.** Their CLI uses jiti (Node-based) to load the config file; using `Bun.env` would crash the migrate command.
- **just-bash sandboxing.** Bash jobs run in an in-process virtual filesystem with **no network access by default**. To allow specific URLs, pass `allowedUrls: ["https://api.example.com"]` in the bash payload. For production multi-tenant, add SSRF blocking for private IP ranges + AWS metadata endpoint.

## Repository layout

```
chronos/
├── docker-compose.yml          # Postgres 16
├── drizzle.config.ts           # drizzle-kit config (tablesFilter scoped)
├── src/
│   ├── main.ts                 # entrypoint: HTTP server + ticker fiber
│   ├── db/
│   │   ├── client.ts           # PgClient + Drizzle Db layer
│   │   └── schema.ts           # Drizzle schema
│   ├── auth/                   # Better Auth config + Effect Auth service
│   ├── jobs/                   # CRUD HTTP routes, repo, Effect Schema
│   ├── runs/                   # read routes + repo + Schema
│   ├── notifications/          # read routes + repo + Schema
│   ├── ticker/                 # claim loop (FOR UPDATE SKIP LOCKED)
│   └── workflows/              # WebhookJob + BashJob + dispatch
├── web/                        # Vite + React + Tailwind + shadcn dashboard
└── PRD.md                      # design doc
```

## Scripts

```bash
# backend
bun run dev          # bun --watch src/main.ts (auto-restart on change)
bun run start        # plain bun src/main.ts
bun run typecheck    # tsc --noEmit

# database
bun run db:up        # docker compose up -d postgres
bun run db:down
bun run db:logs
bun run db:push      # drizzle-kit push (sync schema)
bun run db:generate  # drizzle-kit generate (create versioned migration)
bun run db:studio    # drizzle-kit studio (DB GUI)

# frontend
cd web
bun dev              # Vite dev server with /api proxy
bun run build        # tsc -b && vite build
```

## License

MIT
