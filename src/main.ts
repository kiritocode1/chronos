import * as ClusterWorkflowEngine from "@effect/cluster/ClusterWorkflowEngine"
import * as SingleRunner from "@effect/cluster/SingleRunner"
import * as SqlClient from "@effect/sql/SqlClient"
import {
  HttpRouter,
  HttpServer,
  HttpServerResponse,
} from "@effect/platform"
import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { WorkflowEngine } from "@effect/workflow/WorkflowEngine"
import { Effect, Layer } from "effect"

import { betterAuthApp } from "./auth/http.ts"
import { Auth, AuthLive } from "./auth/service.ts"
import { DbLive, SqlLive } from "./db/client.ts"
import { jobsRoutes } from "./jobs/http.ts"
import { JobsRepoLive } from "./jobs/repo.ts"
import { JobRunsRepoLive } from "./runs/repo.ts"
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

const router = baseRoutes.pipe(HttpRouter.concat(jobsRoutes))

const ServerLive = HttpServer.serve(router).pipe(
  Layer.provide(
    BunHttpServer.layer({ port: Number(Bun.env.PORT ?? 3000) }),
  ),
)

const ClusterLive = ClusterWorkflowEngine.layer.pipe(
  Layer.provide(SingleRunner.layer({ runnerStorage: "sql" })),
)

const AppLive = Layer.mergeAll(
  AuthLive,
  JobsRepoLive,
  JobRunsRepoLive,
  ClusterLive,
).pipe(Layer.provideMerge(DbLive), Layer.provideMerge(SqlLive))

const main = Effect.gen(function* () {
  const engine = yield* WorkflowEngine
  yield* engine.register(WebhookJob, executeWebhookJob)
  yield* engine.register(BashJob, executeBashJob)
  yield* Effect.forkDaemon(tickerLoop)
  return yield* Layer.launch(ServerLive)
}).pipe(Effect.scoped, Effect.provide(AppLive))

BunRuntime.runMain(main)
