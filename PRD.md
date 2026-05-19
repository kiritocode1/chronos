# Chronos — Product Requirements Document

> A distributed job scheduler. Submits, executes, monitors one-time and recurring tasks. Backend Engineering Launchpad case study.

---

## 1. Overview

Users submit **jobs** (webhook calls or sandboxed bash scripts) to run either once at a future time or on a recurring cron schedule. Chronos durably executes them, retries on failure, surfaces logs and notifies the owner when a job exhausts its retry budget.

## 2. Goals & Non-Goals

**Goals**
- One-time jobs (`run_at` ISO timestamp) and recurring jobs (cron strings)
- Two execution modes: HTTP webhook, sandboxed bash (`just-bash`)
- Per-user ownership; users can list, inspect, pause, reschedule, cancel, manually trigger
- Durable execution: workflows survive restarts; retries with exponential backoff + jitter
- Full per-run logs (stdout/stderr/exit for bash; status/body/error for webhook)
- In-app notification on persistent failure
- Minimal dashboard UI

**Non-Goals (v1)**
- Arbitrary user-supplied JS/TS code execution
- Email/SMS/push notification infra
- OAuth / magic links / passkeys / 2FA
- Multi-tenancy beyond per-user isolation (no orgs, no roles)
- Job dependencies / DAGs / fan-out
- Horizontal autoscaling of workers (architecture supports it; ops not wired)

## 3. Architecture

```
┌─────────────┐      ┌────────────────────────────────────────┐
│  web/       │ HTTP │ Bun process (chronos/src)              │
│  Vite SPA   │─────▶│  ┌──────────────────────────────────┐  │
└─────────────┘      │  │ HTTP API (@effect/platform-bun)  │  │
                     │  │  · Better Auth on /api/auth/*    │  │
                     │  │  · Jobs CRUD                     │  │
                     │  │  · Runs read                     │  │
                     │  │  · Notifications read            │  │
                     │  └──────────────────────────────────┘  │
                     │  ┌──────────────────────────────────┐  │
                     │  │ Ticker (Effect fiber)            │  │
                     │  │  · loops every TICK_INTERVAL_MS  │  │
                     │  │  · claims due jobs               │  │
                     │  │    (FOR UPDATE SKIP LOCKED)      │  │
                     │  │  · starts a workflow per claim   │  │
                     │  └──────────────────────────────────┘  │
                     │  ┌──────────────────────────────────┐  │
                     │  │ Workflow runtime (@effect/workflow) │
                     │  │  · WebhookJob workflow            │  │
                     │  │  · BashJob workflow               │  │
                     │  │  · Durable store: Postgres        │  │
                     │  └──────────────────────────────────┘  │
                     └────────────────────────────────────────┘
                                          │
                                          ▼
                                   ┌──────────────┐
                                   │ Postgres     │
                                   │ (Docker)     │
                                   └──────────────┘
```

**Why this shape**
- The Job row is the user-facing entity; the workflow is the per-execution durable unit.
- `FOR UPDATE SKIP LOCKED` means N tickers run safely in parallel — no leader election.
- Workflows persist their state in Postgres, so a crash mid-execution resumes from the last step boundary.

## 4. Data Model

### Owned by Better Auth
- `user`, `session`, `account`, `verification` — schema defined by Better Auth's Postgres adapter.

### Owned by Chronos

**`jobs`** — user-facing scheduled work
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → user.id | |
| `name` | text | user-readable label |
| `mode` | enum `webhook` \| `bash` | |
| `payload` | jsonb | mode-specific config (see below) |
| `cron` | text NULL | cron expression for recurring jobs |
| `run_at` | timestamptz NULL | absolute time for one-time jobs |
| `next_run_at` | timestamptz | denormalized — driver for the ticker query |
| `retry_policy` | jsonb | `{ max_attempts, base_ms, max_ms, jitter }` |
| `status` | enum `active` \| `paused` \| `completed` \| `failed` | |
| `created_at`, `updated_at` | timestamptz | |

Invariant: exactly one of (`cron`, `run_at`) is non-NULL.

**`payload` shapes:**
```jsonc
// webhook
{ "url": "https://…", "method": "POST", "headers": {...}, "body": "...", "timeout_ms": 30000 }
// bash
{ "script": "echo hello | wc -l", "timeout_ms": 30000, "env": { "FOO": "bar" } }
```

**`job_runs`** — one row per execution attempt
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `job_id` | uuid FK → jobs.id | |
| `workflow_id` | text | id of the @effect/workflow instance |
| `attempt_number` | int | starts at 1 |
| `status` | enum `running` \| `succeeded` \| `failed` | |
| `started_at`, `finished_at` | timestamptz | |
| `stdout`, `stderr` | text (truncated to 64KB) | bash mode |
| `exit_code` | int NULL | bash mode |
| `response_status` | int NULL | webhook mode |
| `response_body` | text (truncated 8KB) | webhook mode |
| `error_message` | text NULL | network failure, timeout, etc. |

**`notifications`** — surfaced to user when retries exhausted
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `job_id` | uuid FK | |
| `run_id` | uuid FK → job_runs.id | points at the failing run for log drill-in |
| `kind` | enum `failure` | room for `success_after_recovery`, etc. later |
| `created_at` | timestamptz | |
| `seen_at` | timestamptz NULL | |

## 5. API

All `/api/jobs/*`, `/api/runs/*`, `/api/notifications/*` require a Better Auth session cookie. Unauthenticated requests get 401.

| Method | Path | Purpose |
|---|---|---|
| ALL | `/api/auth/*` | Better Auth (signup, signin, signout, session) |
| POST | `/api/jobs` | create job |
| GET | `/api/jobs` | list user's jobs (paginated, filterable by status/mode) |
| GET | `/api/jobs/:id` | job detail |
| PATCH | `/api/jobs/:id` | edit (schedule, payload, retry policy, name, paused/active) |
| DELETE | `/api/jobs/:id` | cancel + delete |
| POST | `/api/jobs/:id/run` | manually trigger now (in addition to schedule) |
| GET | `/api/jobs/:id/runs` | run history for a job (paginated) |
| GET | `/api/runs/:id` | single run detail incl. full logs |
| GET | `/api/notifications` | list user's notifications |
| GET | `/api/notifications/unseen-count` | for the UI badge |
| POST | `/api/notifications/:id/seen` | mark read |

Request/response bodies use camelCase JSON. All errors follow `{ error: { code, message } }`. Validation via Effect Schema; bad requests return 400 with field paths.

## 6. Execution Flow

**Ticker loop** (every `TICK_INTERVAL_MS`, default 1000):

```sql
UPDATE jobs SET next_run_at = next_run_at  -- bump updated_at
WHERE id IN (
  SELECT id FROM jobs
  WHERE status = 'active' AND next_run_at <= now()
  ORDER BY next_run_at
  LIMIT 50
  FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

For each claimed job:
1. Insert `job_runs` row (`status='running'`, `attempt_number=1`)
2. Start an Effect Workflow instance keyed by `run_id`
3. Bump the parent `jobs.next_run_at`:
   - one-time: set `status='completed'`, clear `next_run_at`
   - recurring: compute next from `cron` using `croner`

**Workflow body** (per mode):
- **WebhookJob**: HTTP request with timeout → if 2xx mark run succeeded, else fail
- **BashJob**: `just-bash` exec with timeout + memory cap → capture stdout/stderr/exit, fail if exit ≠ 0

**Retry**: Effect `Schedule.exponential().pipe(Schedule.jittered, Schedule.compose(Schedule.recurs(max_attempts - 1)))`. Each attempt writes a new `job_runs` row.

**On terminal failure** (all attempts exhausted): insert a `notifications` row pointing at the last failing `run_id`.

## 7. UI

| Route | Page | Notes |
|---|---|---|
| `/login` | login + signup tabs | Better Auth, email+password |
| `/jobs` | jobs table | name, mode, schedule, status, last run, next run; filter by status |
| `/jobs/new` | create form | mode selector switches the payload form between webhook fields and bash editor |
| `/jobs/:id` | job detail + run history | edit/pause/cancel/run-now controls; runs paginated below |
| `/runs/:id` | run detail | full stdout/stderr (bash) or req/resp (webhook); error message; timing |
| (header) | notifications bell + badge | TanStack Query polls `/api/notifications/unseen-count` every 30s |

Vanilla React. Tailwind for layout. TanStack Query for fetching. React Router for routing. No design system — semantic Tailwind components, ship.

## 8. Stack

| Layer | Choice |
|---|---|
| Runtime | Bun |
| Language | TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| Effect | `effect@3.x`, `@effect/platform`, `@effect/platform-bun`, `@effect/workflow`, `@effect/sql-pg` |
| DB | Postgres 16 in Docker; migrations TBD (likely raw SQL files runnable via `@effect/sql`) |
| Sandbox | `just-bash` (in-process virtual FS, network allowlist) |
| Auth | Better Auth (email+password, Postgres adapter) |
| Cron | `croner` |
| HTTP server | `@effect/platform-bun` HttpServer |
| Frontend | Vite + React + TS + Tailwind + TanStack Query + React Router |
| Dev orchestration | `docker compose up postgres`; `bun --hot src/main.ts`; `bun --cwd web dev` |

## 9. Repository Layout (target)

```
chronos/
├── docker-compose.yml          # postgres
├── src/                        # backend
│   ├── main.ts                 # entrypoint (HTTP server + ticker fiber)
│   ├── db/
│   │   ├── schema.sql          # raw migrations
│   │   └── client.ts           # @effect/sql-pg layer
│   ├── auth/
│   │   ├── better-auth.ts      # config
│   │   └── service.ts          # Auth.requireUser Effect service
│   ├── jobs/
│   │   ├── http.ts             # routes
│   │   ├── repo.ts             # SQL access
│   │   └── schema.ts           # Effect Schema input/output
│   ├── runs/
│   │   ├── http.ts
│   │   └── repo.ts
│   ├── notifications/
│   │   ├── http.ts
│   │   └── repo.ts
│   ├── ticker/
│   │   └── ticker.ts           # fiber loop, claim + dispatch
│   └── workflows/
│       ├── webhook-job.ts
│       └── bash-job.ts
├── web/                        # vite app
├── PRD.md
└── README.md
```

## 10. Milestones

1. **Skeleton** — docker-compose for Postgres, `@effect/sql-pg` connection layer, schema SQL applied, "hello" HTTP route
2. **Auth** — Better Auth mounted, Effect `Auth` service, protected `/api/me`
3. **Jobs CRUD** — create/list/get/patch/delete with validation; no execution yet
4. **Ticker + WebhookJob workflow** — first end-to-end run: schedule a webhook job, watch it execute, see the `job_runs` row
5. **BashJob workflow** — same path with `just-bash`
6. **Retries + notifications** — exponential backoff, notification on terminal failure
7. **Runs + notifications API** — read-side endpoints
8. **Vite dashboard** — login, jobs list, create, detail, runs, notifications
9. **README + explainer video** — design write-up, demo

## 11. Open Questions

- Timezone for cron: store cron + IANA tz on the job, or assume UTC? UTC v1.
- Max log size: 64KB stdout/stderr feels right; revisit if real demos hit it.
- Soft delete vs hard delete on `DELETE /api/jobs/:id`: hard delete v1, run history orphans aren't a problem since they're FK'd CASCADE.

## 12. Resolved Decisions

**Workflow storage:** `@effect/workflow` only defines the `WorkflowEngine` protocol. We use `ClusterWorkflowEngine` from `@effect/cluster`, backed by `SqlMessageStorage` + `SqlRunnerStorage` against the same Postgres (via `@effect/sql-pg`). Single-node cluster — all entities on one runner, no network overhead. Cluster's storage layers self-bootstrap their tables on init.

**Chronos's own schema migration:** single `src/db/schema.sql` file applied idempotently at boot via `SqlClient.unsafe`. `@effect/sql`'s Migrator API is available if we outgrow this.

**Bash network allowlist:** per-job in the `payload` (`allowedUrls: []`), empty by default (no network). README documents production-multi-tenant additions: block private IP ranges, AWS metadata endpoint, etc.
