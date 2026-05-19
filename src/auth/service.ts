import { HttpServerRequest } from "@effect/platform"
import { Context, Data, Effect, Layer } from "effect"

import { auth, type User } from "./better-auth.ts"

export class Unauthorized extends Data.TaggedError("Unauthorized")<{
  readonly reason?: string
}> {}

const toHeaders = (
  record: ReadonlyMap<string, string> | Record<string, string | undefined>,
): Headers => {
  const h = new Headers()
  if (record instanceof Map) {
    for (const [k, v] of record) h.set(k, v)
  } else {
    for (const [k, v] of Object.entries(record)) {
      if (v != null) h.set(k, v)
    }
  }
  return h
}

export class Auth extends Context.Tag("Auth")<
  Auth,
  {
    readonly requireUser: Effect.Effect<
      User,
      Unauthorized,
      HttpServerRequest.HttpServerRequest
    >
  }
>() {}

export const AuthLive = Layer.succeed(Auth, {
  requireUser: Effect.gen(function* () {
    const req = yield* HttpServerRequest.HttpServerRequest
    const headers = toHeaders(req.headers)
    const session = yield* Effect.tryPromise({
      try: () => auth.api.getSession({ headers }),
      catch: (e) => new Unauthorized({ reason: String(e) }),
    })
    if (!session?.user) {
      return yield* new Unauthorized({ reason: "no session" })
    }
    return session.user
  }),
})
