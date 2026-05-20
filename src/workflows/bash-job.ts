import * as Activity from "@effect/workflow/Activity"
import * as Workflow from "@effect/workflow/Workflow"
import { Duration, Effect, Schedule, Schema } from "effect"
import { Bash } from "just-bash"

const envInt = (key: string, fallback: number) => {
  const raw = Bun.env[key]
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const executionLimits = {
  maxCommandCount: envInt("BASH_MAX_COMMANDS", 1_000_000),
  maxLoopIterations: envInt("BASH_MAX_LOOPS", 1_000_000),
  maxAwkIterations: envInt("BASH_MAX_LOOPS", 1_000_000),
  maxJqIterations: envInt("BASH_MAX_LOOPS", 1_000_000),
  maxSedIterations: envInt("BASH_MAX_LOOPS", 1_000_000),
}

import { NotificationsRepo } from "../notifications/repo.ts"
import { JobRunsRepo } from "../runs/repo.ts"
import { RetryPolicy } from "../jobs/schema.ts"

const truncate = (s: string, max = 65536) =>
  s.length > max ? s.slice(0, max) : s

export const BashSuccess = Schema.Struct({
  stdout: Schema.String,
  stderr: Schema.String,
  exitCode: Schema.Number,
})

export const BashFailure = Schema.Struct({
  reason: Schema.String,
  stdout: Schema.optional(Schema.String),
  stderr: Schema.optional(Schema.String),
  exitCode: Schema.optional(Schema.Number),
})

export const BashJob = Workflow.make({
  name: "BashJob",
  payload: {
    runId: Schema.String,
    jobId: Schema.String,
    userId: Schema.String,
    script: Schema.String,
    timeoutMs: Schema.Number,
    env: Schema.Record({ key: Schema.String, value: Schema.String }),
    allowedUrls: Schema.Array(Schema.String),
    retryPolicy: RetryPolicy,
  },
  success: BashSuccess,
  error: BashFailure,
  idempotencyKey: (p) => p.runId,
})

export type BashPayloadT = typeof BashJob.payloadSchema.Type

const buildRetrySchedule = (p: typeof RetryPolicy.Type) => {
  const base = Schedule.exponential(Duration.millis(p.baseMs))
  const capped = Schedule.either(base, Schedule.spaced(Duration.millis(p.maxMs)))
  const withJitter = p.jitter ? Schedule.jittered(capped) : capped
  return Schedule.intersect(withJitter, Schedule.recurs(p.maxAttempts - 1))
}

export const executeBashJob = (
  payload: BashPayloadT,
  _executionId: string,
) =>
  Effect.gen(function* () {
    const runs = yield* JobRunsRepo
    const notifications = yield* NotificationsRepo

    const bashActivity = Activity.make({
      name: "BashExec",
      success: BashSuccess,
      error: BashFailure,
      execute: Effect.gen(function* () {
        const bash = new Bash({
          env: payload.env,
          network: { allowedUrlPrefixes: [...payload.allowedUrls] },
          executionLimits,
        })
        const controller = new AbortController()
        const timer = setTimeout(
          () => controller.abort(),
          payload.timeoutMs,
        )

        const result = yield* Effect.tryPromise({
          try: () =>
            bash.exec(payload.script, { signal: controller.signal }),
          catch: (e): typeof BashFailure.Type => ({
            reason: `bash execution error: ${String(e)}`,
          }),
        }).pipe(Effect.ensuring(Effect.sync(() => clearTimeout(timer))))

        if (result.exitCode !== 0) {
          return yield* Effect.fail<typeof BashFailure.Type>({
            reason: `non-zero exit code ${result.exitCode}`,
            stdout: truncate(result.stdout),
            stderr: truncate(result.stderr),
            exitCode: result.exitCode,
          })
        }

        return {
          stdout: truncate(result.stdout),
          stderr: truncate(result.stderr),
          exitCode: result.exitCode,
        }
      }),
    })

    const withRetries = bashActivity.pipe(
      Effect.retry(buildRetrySchedule(payload.retryPolicy)),
    )

    return yield* withRetries.pipe(
      Effect.tap((ok) =>
        Effect.orDie(
          runs.finalizeBashSuccess(payload.runId, {
            stdout: ok.stdout,
            stderr: ok.stderr,
            exitCode: ok.exitCode,
          }),
        ),
      ),
      Effect.tapError((err) =>
        Effect.gen(function* () {
          yield* Effect.orDie(
            runs.finalizeFailure(payload.runId, {
              errorMessage: err.reason,
              stdout: err.stdout,
              stderr: err.stderr,
              exitCode: err.exitCode,
            }),
          )
          yield* Effect.orDie(
            notifications.insertFailure({
              userId: payload.userId,
              jobId: payload.jobId,
              runId: payload.runId,
            }),
          )
        }),
      ),
    )
  })
