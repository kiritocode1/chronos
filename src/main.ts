import * as ClusterWorkflowEngine from "@effect/cluster/ClusterWorkflowEngine"
import { RunnerAddress } from "@effect/cluster/RunnerAddress"
import * as Singleton from "@effect/cluster/Singleton"
import * as SqlClient from "@effect/sql/SqlClient"
import {
  HttpRouter,
  HttpServer,
  HttpServerResponse,
} from "@effect/platform"
import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import * as BunClusterSocket from "@effect/platform-bun/BunClusterSocket"
import { WorkflowEngine } from "@effect/workflow/WorkflowEngine"
import { Effect, Layer, Option } from "effect"

import { betterAuthApp } from "./auth/http.ts"
import { Auth, AuthLive } from "./auth/service.ts"
import { DbLive, SqlLive } from "./db/client.ts"
import { jobsRoutes } from "./jobs/http.ts"
import { JobsRepoLive } from "./jobs/repo.ts"
import { notificationsRoutes } from "./notifications/http.ts"
import { NotificationsRepoLive } from "./notifications/repo.ts"
import { runsRoutes } from "./runs/http.ts"
import { JobRunsRepoLive } from "./runs/repo.ts"
import { spaRoutes } from "./static/http.ts"
import { tickerLoop } from "./ticker/ticker.ts"
import { BashJob, executeBashJob } from "./workflows/bash-job.ts"
import { executeWebhookJob, WebhookJob } from "./workflows/webhook-job.ts"

const baseRoutes = HttpRouter.empty.pipe(
  HttpRouter.get("/hello", HttpServerResponse.text("hello from chronos")),
  HttpRouter.get(
    "/health",
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`SELECT 1`
      return yield* HttpServerResponse.json({ ok: true, db: "up" })
    }),
  ),
  HttpRouter.mountApp("/api/auth", betterAuthApp),
  HttpRouter.get(
    "/api/me",
    Effect.gen(function* () {
      const auth = yield* Auth
      const user = yield* auth.requireUser
      return yield* HttpServerResponse.json({ user })
    }).pipe(
      Effect.catchTag("Unauthorized", () =>
        Effect.succeed(
          HttpServerResponse.text("Unauthorized", { status: 401 }),
        ),
      ),
    ),
  ),
)

const router = baseRoutes.pipe(
  HttpRouter.concat(jobsRoutes),
  HttpRouter.concat(runsRoutes),
  HttpRouter.concat(notificationsRoutes),
  // Catch-all SPA fallback — must stay last so it can't shadow the API.
  HttpRouter.concat(spaRoutes),
)

const ServerLive = HttpServer.serve(router).pipe(
  Layer.provide(
    BunHttpServer.layer({ port: Number(Bun.env.PORT ?? 3000) }),
  ),
)

const runnerHost = Bun.env.RUNNER_HOST ?? "127.0.0.1"
const runnerPort = Number(Bun.env.RUNNER_PORT ?? 34430)

const ShardingLive = BunClusterSocket.layer({
  storage: "sql",
  shardingConfig: {
    runnerAddress: Option.some(
      new RunnerAddress({ host: runnerHost, port: runnerPort }),
    ),
  },
})

const ClusterLive = ClusterWorkflowEngine.layer.pipe(
  Layer.provideMerge(ShardingLive),
)

const TickerSingleton = Singleton.make("chronos-ticker", tickerLoop)

const ReposLive = Layer.mergeAll(
  AuthLive,
  JobsRepoLive,
  JobRunsRepoLive,
  NotificationsRepoLive,
)

const AppLive = TickerSingleton.pipe(
  Layer.provideMerge(ReposLive),
  Layer.provideMerge(ClusterLive),
  Layer.provideMerge(DbLive),
  Layer.provideMerge(SqlLive),
)

const main = Effect.gen(function* () {
  const engine = yield* WorkflowEngine
  yield* engine.register(WebhookJob, executeWebhookJob)
  yield* engine.register(BashJob, executeBashJob)
  return yield* Layer.launch(ServerLive)
}).pipe(Effect.scoped, Effect.provide(AppLive))

// in god we trust. 
BunRuntime.runMain(main)
