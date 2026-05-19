import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform"
import type { HttpBody, HttpServerError } from "@effect/platform"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Effect, ParseResult, Schema } from "effect"

import { Auth, Unauthorized } from "../auth/service.ts"
import { NotificationsRepo } from "./repo.ts"

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

const PathId = Schema.Struct({ id: Schema.String })

export const notificationsRoutes = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/notifications",
    handleErrors(
      Effect.gen(function* () {
        const auth = yield* Auth
        const repo = yield* NotificationsRepo
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
        const unseenOnly = url.searchParams.get("unseenOnly") === "true"
        const list = yield* repo.list(user.id, { limit, offset, unseenOnly })
        return yield* HttpServerResponse.json({
          notifications: list,
          limit,
          offset,
        })
      }),
    ),
  ),

  HttpRouter.get(
    "/api/notifications/unseen-count",
    handleErrors(
      Effect.gen(function* () {
        const auth = yield* Auth
        const repo = yield* NotificationsRepo
        const user = yield* auth.requireUser
        const c = yield* repo.unseenCount(user.id)
        return yield* HttpServerResponse.json({ count: c })
      }),
    ),
  ),

  HttpRouter.post(
    "/api/notifications/:id/seen",
    handleErrors(
      Effect.gen(function* () {
        const auth = yield* Auth
        const repo = yield* NotificationsRepo
        const user = yield* auth.requireUser
        const { id } = yield* HttpRouter.schemaPathParams(PathId)
        const ok = yield* repo.markSeen(id, user.id)
        if (!ok) return errJson(404, "Notification not found")
        return HttpServerResponse.empty({ status: 204 })
      }),
    ),
  ),
)
