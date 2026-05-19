import { and, desc, eq, sql } from "drizzle-orm"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Context, Effect, Layer, ParseResult, Schema } from "effect"

import { Db } from "../db/client.ts"
import { jobRuns, jobs } from "../db/schema.ts"
import { JobRun } from "./schema.ts"

export interface WebhookResult {
  readonly responseStatus: number
  readonly responseBody: string
}

export interface BashResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export interface FinalizeFailure {
  readonly errorMessage: string
  readonly responseStatus?: number | undefined
  readonly responseBody?: string | undefined
  readonly stdout?: string | undefined
  readonly stderr?: string | undefined
  readonly exitCode?: number | undefined
}

export interface JobRunsRepoApi {
  readonly start: (input: {
    readonly jobId: string
    readonly workflowId: string
    readonly attemptNumber?: number
  }) => Effect.Effect<{ readonly id: string }, EffectDrizzleQueryError>
  readonly finalizeWebhookSuccess: (
    runId: string,
    result: WebhookResult,
  ) => Effect.Effect<void, EffectDrizzleQueryError>
  readonly finalizeBashSuccess: (
    runId: string,
    result: BashResult,
  ) => Effect.Effect<void, EffectDrizzleQueryError>
  readonly finalizeFailure: (
    runId: string,
    failure: FinalizeFailure,
  ) => Effect.Effect<void, EffectDrizzleQueryError>
  readonly listByJob: (
    jobId: string,
    userId: string,
    opts: { readonly limit: number; readonly offset: number },
  ) => Effect.Effect<
    ReadonlyArray<JobRun>,
    EffectDrizzleQueryError | ParseResult.ParseError
  >
  readonly getByIdScoped: (
    runId: string,
    userId: string,
  ) => Effect.Effect<
    JobRun | null,
    EffectDrizzleQueryError | ParseResult.ParseError
  >
}

export class JobRunsRepo extends Context.Tag("JobRunsRepo")<
  JobRunsRepo,
  JobRunsRepoApi
>() {}

const decodeRun = (row: unknown) => Schema.decodeUnknown(JobRun)(row)

export const JobRunsRepoLive = Layer.effect(
  JobRunsRepo,
  Effect.gen(function* () {
    const db = yield* Db

    return {
      start: ({ jobId, workflowId, attemptNumber = 1 }) =>
        Effect.gen(function* () {
          const rows = yield* db
            .insert(jobRuns)
            .values({
              jobId,
              workflowId,
              attemptNumber,
              status: "running",
            })
            .returning({ id: jobRuns.id })
          const first = rows[0]
          if (!first) return yield* Effect.die("INSERT job_runs returned no row")
          return { id: first.id }
        }),

      finalizeWebhookSuccess: (runId, result) =>
        db
          .update(jobRuns)
          .set({
            status: "succeeded",
            finishedAt: sql`now()`,
            responseStatus: result.responseStatus,
            responseBody: result.responseBody,
          })
          .where(eq(jobRuns.id, runId))
          .pipe(Effect.asVoid),

      finalizeBashSuccess: (runId, result) =>
        db
          .update(jobRuns)
          .set({
            status: "succeeded",
            finishedAt: sql`now()`,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
          })
          .where(eq(jobRuns.id, runId))
          .pipe(Effect.asVoid),

      finalizeFailure: (runId, f) =>
        db
          .update(jobRuns)
          .set({
            status: "failed",
            finishedAt: sql`now()`,
            errorMessage: f.errorMessage,
            responseStatus: f.responseStatus ?? null,
            responseBody: f.responseBody ?? null,
            stdout: f.stdout ?? null,
            stderr: f.stderr ?? null,
            exitCode: f.exitCode ?? null,
          })
          .where(eq(jobRuns.id, runId))
          .pipe(Effect.asVoid),

      listByJob: (jobId, userId, opts) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select({ run: jobRuns })
            .from(jobRuns)
            .innerJoin(jobs, eq(jobRuns.jobId, jobs.id))
            .where(and(eq(jobRuns.jobId, jobId), eq(jobs.userId, userId)))
            .orderBy(desc(jobRuns.startedAt))
            .limit(opts.limit)
            .offset(opts.offset)
          return yield* Effect.forEach(rows, (r) => decodeRun(r.run))
        }),

      getByIdScoped: (runId, userId) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select({ run: jobRuns })
            .from(jobRuns)
            .innerJoin(jobs, eq(jobRuns.jobId, jobs.id))
            .where(and(eq(jobRuns.id, runId), eq(jobs.userId, userId)))
            .limit(1)
          const first = rows[0]
          return first ? yield* decodeRun(first.run) : null
        }),
    }
  }),
)
