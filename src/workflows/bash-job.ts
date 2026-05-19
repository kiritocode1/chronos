import * as Activity from "@effect/workflow/Activity"
import * as Workflow from "@effect/workflow/Workflow"
import { Effect, Schema } from "effect"
import { Bash } from "just-bash"

import { JobRunsRepo } from "../runs/repo.ts"

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
    script: Schema.String,
    timeoutMs: Schema.Number,
    env: Schema.Record({ key: Schema.String, value: Schema.String }),
    allowedUrls: Schema.Array(Schema.String),
  },
  success: BashSuccess,
  error: BashFailure,
  idempotencyKey: (p) => p.runId,
})

export type BashPayloadT = typeof BashJob.payloadSchema.Type

export const executeBashJob = (
  payload: BashPayloadT,
  _executionId: string,
) =>
  Effect.gen(function* () {
    const repo = yield* JobRunsRepo

    const bashActivity = Activity.make({
      name: "BashExec",
      success: BashSuccess,
      error: BashFailure,
      execute: Effect.gen(function* () {
        const bash = new Bash({
          env: payload.env,
          network: { allowedUrlPrefixes: [...payload.allowedUrls] },
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

    return yield* bashActivity.pipe(
      Effect.tap((ok) =>
        Effect.orDie(
          repo.finalizeBashSuccess(payload.runId, {
            stdout: ok.stdout,
            stderr: ok.stderr,
            exitCode: ok.exitCode,
          }),
        ),
      ),
      Effect.tapError((err) =>
        Effect.orDie(
          repo.finalizeFailure(payload.runId, {
            errorMessage: err.reason,
            stdout: err.stdout,
            stderr: err.stderr,
            exitCode: err.exitCode,
          }),
        ),
      ),
    )
  })
