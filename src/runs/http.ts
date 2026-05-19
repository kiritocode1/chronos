import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform"
import type { HttpBody, HttpServerError } from "@effect/platform"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Effect, ParseResult, Schema } from "effect"

import { Auth, Unauthorized } from "../auth/service.ts"
import { JobRunsRepo } from "./repo.ts"

type KnownError =
  | Unauthorized
  | ParseResult.ParseError
  | EffectDrizzleQueryError
  | HttpServerError.RequestError
  | HttpBody.HttpBodyError

const errJson = (status: number, message: string, extra?: unknown) =>
  HttpServerResponse.unsafeJson(
    { error: { message, ...(extra ? { details: extra } : {}) } },
    { status },
  )

const handleErrors = <A, R>(eff: Effect.Effect<A, KnownError, R>) =>
  eff.pipe(
    Effect.catchTags({
      Unauthorized: () => Effect.succeed(errJson(401, "Unauthorized")),
      ParseError: (e) =>
        Effect.succeed(errJson(400, "Invalid request", String(e))),
      RequestError: (e) =>
        Effect.succeed(errJson(400, "Bad request", e.description)),
      EffectDrizzleQueryError: (e) =>
        Effect.succeed(errJson(500, "Database error", String(e.message))),
      HttpBodyError: () =>
        Effect.succeed(errJson(500, "Failed to encode response body")),
    }),
  )

const PathJobId = Schema.Struct({ id: Schema.String })
const PathRunId = Schema.Struct({ id: Schema.String })

const parsePagination = (url: URL) => ({
  limit: Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? 50), 1),
    200,
  ),
  offset: Math.max(Number(url.searchParams.get("offset") ?? 0), 0),
})

export const runsRoutes = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/jobs/:id/runs",
    handleErrors(
      Effect.gen(function* () {
        const auth = yield* Auth
        const repo = yield* JobRunsRepo
        const user = yield* auth.requireUser
        const { id } = yield* HttpRouter.schemaPathParams(PathJobId)
        const req = yield* HttpServerRequest.HttpServerRequest
        const opts = parsePagination(new URL(req.url, "http://localhost"))
        const runs = yield* repo.listByJob(id, user.id, opts)
        return yield* HttpServerResponse.json({
          runs,
          limit: opts.limit,
          offset: opts.offset,
        })
      }),
    ),
  ),

  HttpRouter.get(
    "/api/runs/:id",
    handleErrors(
      Effect.gen(function* () {
        const auth = yield* Auth
        const repo = yield* JobRunsRepo
        const user = yield* auth.requireUser
        const { id } = yield* HttpRouter.schemaPathParams(PathRunId)
        const run = yield* repo.getByIdScoped(id, user.id)
        if (!run) return errJson(404, "Run not found")
        return yield* HttpServerResponse.json(run)
      }),
    ),
  ),
)
