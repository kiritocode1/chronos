import { Cron } from "croner"
import { and, desc, eq } from "drizzle-orm"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Context, Data, Effect, Layer, ParseResult, Schema } from "effect"

import { Db } from "../db/client.ts"
import { jobs } from "../db/schema.ts"
import {
  CreateJob,
  Job,
  type RetryPolicy,
  type Schedule,
  UpdateJob,
} from "./schema.ts"

export class JobScheduleError extends Data.TaggedError("JobScheduleError")<{
  readonly reason: string
}> {}

const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  baseMs: 1000,
  maxMs: 60_000,
  jitter: true,
}

const computeNextRun = (
  schedule: Schedule,
): Effect.Effect<Date, JobScheduleError> =>
  Effect.gen(function* () {
    if ("cron" in schedule) {
      const next = yield* Effect.try({
        try: () => new Cron(schedule.cron).nextRun(),
        catch: (e) =>
          new JobScheduleError({ reason: `invalid cron: ${String(e)}` }),
      })
      if (!next) {
        return yield* new JobScheduleError({
          reason: "cron has no future runs",
        })
      }
      return next
    }
    return schedule.runAt
  })

const decodeJob = (row: unknown) => Schema.decodeUnknown(Job)(row)

export interface JobsRepoApi {
  readonly create: (
    input: CreateJob,
    userId: string,
  ) => Effect.Effect<Job, | EffectDrizzleQueryError
    | JobScheduleError
    | ParseResult.ParseError>
  readonly listByUser: (
    userId: string,
    opts: { readonly limit: number; readonly offset: number },
  ) => Effect.Effect<
    ReadonlyArray<Job>,
    EffectDrizzleQueryError | ParseResult.ParseError
  >
  readonly getById: (
    id: string,
    userId: string,
  ) => Effect.Effect<
    Job | null,
    EffectDrizzleQueryError | ParseResult.ParseError
  >
  readonly update: (
    id: string,
    userId: string,
    patch: UpdateJob,
  ) => Effect.Effect<
    Job | null,
    | EffectDrizzleQueryError
    | JobScheduleError
    | ParseResult.ParseError
  >
  readonly delete: (
    id: string,
    userId: string,
  ) => Effect.Effect<boolean, EffectDrizzleQueryError>
}

export class JobsRepo extends Context.Tag("JobsRepo")<
  JobsRepo,
  JobsRepoApi
>() {}

export const JobsRepoLive = Layer.effect(
  JobsRepo,
  Effect.gen(function* () {
    const db = yield* Db

    const getById: JobsRepoApi["getById"] = (id, userId) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select()
          .from(jobs)
          .where(and(eq(jobs.id, id), eq(jobs.userId, userId)))
          .limit(1)
        const first = rows[0]
        return first ? yield* decodeJob(first) : null
      })

    return {
      create: (input, userId) =>
        Effect.gen(function* () {
          const mode = input.payload.kind
          const cron = "cron" in input.schedule ? input.schedule.cron : null
          const runAt =
            "runAt" in input.schedule ? input.schedule.runAt : null
          const nextRunAt = yield* computeNextRun(input.schedule)
          const retryPolicy = input.retryPolicy ?? DEFAULT_RETRY

          const rows = yield* db
            .insert(jobs)
            .values({
              userId,
              name: input.name,
              mode,
              payload: input.payload,
              cron,
              runAt,
              nextRunAt,
              retryPolicy,
            })
            .returning()
          const first = rows[0]
          if (!first) return yield* Effect.die("INSERT returned no row")
          return yield* decodeJob(first)
        }),

      listByUser: (userId, opts) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(jobs)
            .where(eq(jobs.userId, userId))
            .orderBy(desc(jobs.createdAt))
            .limit(opts.limit)
            .offset(opts.offset)
          return yield* Effect.forEach(rows, (r) => decodeJob(r))
        }),

      getById,

      update: (id, userId, patch) =>
        Effect.gen(function* () {
          const whereClause = and(eq(jobs.id, id), eq(jobs.userId, userId))

          if (patch.name !== undefined) {
            yield* db
              .update(jobs)
              .set({ name: patch.name, updatedAt: new Date() })
              .where(whereClause)
          }
          if (patch.payload !== undefined) {
            yield* db
              .update(jobs)
              .set({
                mode: patch.payload.kind,
                payload: patch.payload,
                updatedAt: new Date(),
              })
              .where(whereClause)
          }
          if (patch.schedule !== undefined) {
            const cron =
              "cron" in patch.schedule ? patch.schedule.cron : null
            const runAt =
              "runAt" in patch.schedule ? patch.schedule.runAt : null
            const nextRunAt = yield* computeNextRun(patch.schedule)
            yield* db
              .update(jobs)
              .set({ cron, runAt, nextRunAt, updatedAt: new Date() })
              .where(whereClause)
          }
          if (patch.retryPolicy !== undefined) {
            yield* db
              .update(jobs)
              .set({ retryPolicy: patch.retryPolicy, updatedAt: new Date() })
              .where(whereClause)
          }
          if (patch.status !== undefined) {
            yield* db
              .update(jobs)
              .set({ status: patch.status, updatedAt: new Date() })
              .where(whereClause)
          }
          return yield* getById(id, userId)
        }),

      delete: (id, userId) =>
        Effect.gen(function* () {
          const rows = yield* db
            .delete(jobs)
            .where(and(eq(jobs.id, id), eq(jobs.userId, userId)))
            .returning({ id: jobs.id })
          return rows.length > 0
        }),
    }
  }),
)
