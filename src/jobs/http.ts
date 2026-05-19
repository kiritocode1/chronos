import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform"
import type { HttpBody, HttpServerError } from "@effect/platform"
import type { SqlError } from "@effect/sql/SqlError"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Effect, ParseResult, Schema } from "effect"

import { Unauthorized, Auth } from "../auth/service.ts"
import { dispatchJob } from "../workflows/dispatch.ts"
import { JobScheduleError, JobsRepo } from "./repo.ts"
import { CreateJob, UpdateJob } from "./schema.ts"

const errJson = (status: number, message: string, extra?: unknown) =>
  HttpServerResponse.unsafeJson(
    { error: { message, ...(extra ? { details: extra } : {}) } },
    { status },
  )

type KnownError =
  | Unauthorized
  | ParseResult.ParseError
  | JobScheduleError
  | SqlError
  | EffectDrizzleQueryError
  | HttpServerError.RequestError
  | HttpBody.HttpBodyError

const handleErrors = <A, R>(eff: Effect.Effect<A, KnownError, R>) =>
  eff.pipe(
    Effect.catchTags({
      Unauthorized: () => Effect.succeed(errJson(401, "Unauthorized")),
      ParseError: (e) =>
        Effect.succeed(errJson(400, "Invalid request body", String(e))),
      JobScheduleError: (e) => Effect.succeed(errJson(400, e.reason)),
      RequestError: (e) =>
        Effect.succeed(errJson(400, "Bad request", e.description)),
      SqlError: (e) =>
        Effect.succeed(errJson(500, "Database error", String(e.message))),
      EffectDrizzleQueryError: (e) =>
        Effect.succeed(errJson(500, "Database error", String(e.message))),
      HttpBodyError: () =>
        Effect.succeed(errJson(500, "Failed to encode response body")),
    }),
  )

const PathId = Schema.Struct({ id: Schema.String })

export const jobsRoutes = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/api/jobs",
    handleErrors(
      Effect.gen(function* () {
        const auth = yield* Auth
        const repo = yield* JobsRepo
        const user = yield* auth.requireUser
        const input = yield* HttpServerRequest.schemaBodyJson(CreateJob)
        const job = yield* repo.create(input, user.id)
        return yield* HttpServerResponse.json(job, { status: 201 })
      }),
    ),
  ),

  HttpRouter.get(
    "/api/jobs",
    handleErrors(
      Effect.gen(function* () {
        const auth = yield* Auth
        const repo = yield* JobsRepo
        const user = yield* auth.requireUser
        const req = yield* HttpServerRequest.HttpServerRequest
        const url = new URL(req.url, "http://localhost")
        const limit = Math.min(
          Math.max(Number(url.searchParams.get("limit") ?? 50), 1),
          200,
        )
        const offset = Math.max(
          Number(url.searchParams.get("offset") ?? 0),
          0,
        )
        const jobs = yield* repo.listByUser(user.id, { limit, offset })
        return yield* HttpServerResponse.json({ jobs, limit, offset })
      }),
    ),
  ),

  HttpRouter.get(
    "/api/jobs/:id",
    handleErrors(
      Effect.gen(function* () {
        const auth = yield* Auth
        const repo = yield* JobsRepo
        const user = yield* auth.requireUser
        const { id } = yield* HttpRouter.schemaPathParams(PathId)
        const job = yield* repo.getById(id, user.id)
        if (!job) return errJson(404, "Job not found")
        return yield* HttpServerResponse.json(job)
      }),
    ),
  ),

  HttpRouter.patch(
    "/api/jobs/:id",
    handleErrors(
      Effect.gen(function* () {
        const auth = yield* Auth
        const repo = yield* JobsRepo
        const user = yield* auth.requireUser
        const { id } = yield* HttpRouter.schemaPathParams(PathId)
        const patch = yield* HttpServerRequest.schemaBodyJson(UpdateJob)
        const job = yield* repo.update(id, user.id, patch)
        if (!job) return errJson(404, "Job not found")
        return yield* HttpServerResponse.json(job)
      }),
    ),
  ),

  HttpRouter.post(
    "/api/jobs/:id/run",
    handleErrors(
      Effect.gen(function* () {
        const auth = yield* Auth
        const repo = yield* JobsRepo
        const user = yield* auth.requireUser
        const { id } = yield* HttpRouter.schemaPathParams(PathId)
        const job = yield* repo.getById(id, user.id)
        if (!job) return errJson(404, "Job not found")
        const result = yield* dispatchJob(job)
        return yield* HttpServerResponse.json(
          {
            runId: result.runId,
            executionId: result.executionId,
            mode: result.mode,
          },
          { status: 202 },
        )
      }),
    ),
  ),

  HttpRouter.del(
    "/api/jobs/:id",
    handleErrors(
      Effect.gen(function* () {
        const auth = yield* Auth
        const repo = yield* JobsRepo
        const user = yield* auth.requireUser
        const { id } = yield* HttpRouter.schemaPathParams(PathId)
        const deleted = yield* repo.delete(id, user.id)
        if (!deleted) return errJson(404, "Job not found")
        return HttpServerResponse.empty({ status: 204 })
      }),
    ),
  ),
)
