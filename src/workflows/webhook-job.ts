import * as Activity from "@effect/workflow/Activity"
import * as Workflow from "@effect/workflow/Workflow"
import { Duration, Effect, Schedule, Schema } from "effect"

import { NotificationsRepo } from "../notifications/repo.ts"
import { JobRunsRepo } from "../runs/repo.ts"
import { RetryPolicy } from "../jobs/schema.ts"

const truncate = (s: string, max = 8192) =>
  s.length > max ? s.slice(0, max) : s

export const WebhookSuccess = Schema.Struct({
  status: Schema.Number,
  body: Schema.String,
})

export const WebhookFailure = Schema.Struct({
  reason: Schema.String,
  status: Schema.optional(Schema.Number),
  body: Schema.optional(Schema.String),
})

export const WebhookJob = Workflow.make({
  name: "WebhookJob",
  payload: {
    runId: Schema.String,
    jobId: Schema.String,
    userId: Schema.String,
    url: Schema.String,
    method: Schema.Literal("GET", "POST", "PUT", "PATCH", "DELETE"),
    headers: Schema.Record({ key: Schema.String, value: Schema.String }),
    body: Schema.NullOr(Schema.String),
    timeoutMs: Schema.Number,
    retryPolicy: RetryPolicy,
  },
  success: WebhookSuccess,
  error: WebhookFailure,
  idempotencyKey: (p) => p.runId,
})

export type WebhookPayloadT = typeof WebhookJob.payloadSchema.Type

const buildRetrySchedule = (p: typeof RetryPolicy.Type) => {
  const base = Schedule.exponential(Duration.millis(p.baseMs))
  const capped = Schedule.either(base, Schedule.spaced(Duration.millis(p.maxMs)))
  const withJitter = p.jitter ? Schedule.jittered(capped) : capped
  return Schedule.intersect(withJitter, Schedule.recurs(p.maxAttempts - 1))
}

export const executeWebhookJob = (
  payload: WebhookPayloadT,
  _executionId: string,
) =>
  Effect.gen(function* () {
    const runs = yield* JobRunsRepo
    const notifications = yield* NotificationsRepo

    const fetchActivity = Activity.make({
      name: "WebhookFetch",
      success: WebhookSuccess,
      error: WebhookFailure,
      execute: Effect.gen(function* () {
        const controller = new AbortController()
        const timer = setTimeout(
          () => controller.abort(),
          payload.timeoutMs,
        )
        const res = yield* Effect.tryPromise({
          try: () =>
            fetch(payload.url, {
              method: payload.method,
              headers: payload.headers,
              body: payload.body ?? undefined,
              signal: controller.signal,
            }),
          catch: (e): typeof WebhookFailure.Type => ({
            reason: `network error: ${String(e)}`,
          }),
        }).pipe(Effect.ensuring(Effect.sync(() => clearTimeout(timer))))

        const body = yield* Effect.tryPromise({
          try: () => res.text(),
          catch: (e): typeof WebhookFailure.Type => ({
            reason: `failed to read response body: ${String(e)}`,
            status: res.status,
          }),
        })

        if (!res.ok) {
          return yield* Effect.fail<typeof WebhookFailure.Type>({
            reason: `HTTP ${res.status}`,
            status: res.status,
            body: truncate(body),
          })
        }
        return { status: res.status, body: truncate(body) }
      }),
    })

    const withRetries = fetchActivity.pipe(
      Effect.retry(buildRetrySchedule(payload.retryPolicy)),
    )

    return yield* withRetries.pipe(
      Effect.tap((ok) =>
        Effect.orDie(
          runs.finalizeWebhookSuccess(payload.runId, {
            responseStatus: ok.status,
            responseBody: ok.body,
          }),
        ),
      ),
      Effect.tapError((err) =>
        Effect.gen(function* () {
          yield* Effect.orDie(
            runs.finalizeFailure(payload.runId, {
              errorMessage: err.reason,
              responseStatus: err.status,
              responseBody: err.body,
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
