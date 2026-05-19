import { and, count, desc, eq, isNull, sql } from "drizzle-orm"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Context, Effect, Layer, ParseResult, Schema } from "effect"

import { Db } from "../db/client.ts"
import { notifications } from "../db/schema.ts"
import { Notification } from "./schema.ts"

export interface NotificationsRepoApi {
  readonly insertFailure: (input: {
    readonly userId: string
    readonly jobId: string
    readonly runId: string | null
  }) => Effect.Effect<{ readonly id: string }, EffectDrizzleQueryError>
  readonly list: (
    userId: string,
    opts: {
      readonly limit: number
      readonly offset: number
      readonly unseenOnly?: boolean
    },
  ) => Effect.Effect<
    ReadonlyArray<Notification>,
    EffectDrizzleQueryError | ParseResult.ParseError
  >
  readonly unseenCount: (
    userId: string,
  ) => Effect.Effect<number, EffectDrizzleQueryError>
  readonly markSeen: (
    id: string,
    userId: string,
  ) => Effect.Effect<boolean, EffectDrizzleQueryError>
}

export class NotificationsRepo extends Context.Tag("NotificationsRepo")<
  NotificationsRepo,
  NotificationsRepoApi
>() {}

const decodeNotification = (row: unknown) =>
  Schema.decodeUnknown(Notification)(row)

export const NotificationsRepoLive = Layer.effect(
  NotificationsRepo,
  Effect.gen(function* () {
    const db = yield* Db
    return {
      insertFailure: ({ userId, jobId, runId }) =>
        Effect.gen(function* () {
          const rows = yield* db
            .insert(notifications)
            .values({ userId, jobId, runId, kind: "failure" })
            .returning({ id: notifications.id })
          const first = rows[0]
          if (!first) {
            return yield* Effect.die(
              "INSERT notifications returned no row",
            )
          }
          return { id: first.id }
        }),

      list: (userId, opts) =>
        Effect.gen(function* () {
          const where = opts.unseenOnly
            ? and(
                eq(notifications.userId, userId),
                isNull(notifications.seenAt),
              )
            : eq(notifications.userId, userId)
          const rows = yield* db
            .select()
            .from(notifications)
            .where(where)
            .orderBy(desc(notifications.createdAt))
            .limit(opts.limit)
            .offset(opts.offset)
          return yield* Effect.forEach(rows, (r) => decodeNotification(r))
        }),

      unseenCount: (userId) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select({ c: count() })
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, userId),
                isNull(notifications.seenAt),
              ),
            )
          return rows[0]?.c ?? 0
        }),

      markSeen: (id, userId) =>
        Effect.gen(function* () {
          const rows = yield* db
            .update(notifications)
            .set({ seenAt: sql`now()` })
            .where(
              and(
                eq(notifications.id, id),
                eq(notifications.userId, userId),
              ),
            )
            .returning({ id: notifications.id })
          return rows.length > 0
        }),
    }
  }),
)
