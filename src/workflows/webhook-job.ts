import * as Activity from "@effect/workflow/Activity"
import * as Workflow from "@effect/workflow/Workflow"
import { Effect, Schema } from "effect"

import { JobRunsRepo } from "../runs/repo.ts"

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
    url: Schema.String,
    method: Schema.Literal("GET", "POST", "PUT", "PATCH", "DELETE"),
    headers: Schema.Record({ key: Schema.String, value: Schema.String }),
    body: Schema.NullOr(Schema.String),
    timeoutMs: Schema.Number,
  },
  success: WebhookSuccess,
  error: WebhookFailure,
  idempotencyKey: (p) => p.runId,
})

export type WebhookPayloadT = typeof WebhookJob.payloadSchema.Type

export const executeWebhookJob = (
  payload: WebhookPayloadT,
  _executionId: string,
) =>
  Effect.gen(function* () {
    const repo = yield* JobRunsRepo

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

    return yield* fetchActivity.pipe(
      Effect.tap((ok) =>
        Effect.orDie(
          repo.finalizeWebhookSuccess(payload.runId, {
            responseStatus: ok.status,
            responseBody: ok.body,
          }),
        ),
      ),
      Effect.tapError((err) =>
        Effect.orDie(
          repo.finalizeFailure(payload.runId, {
            errorMessage: err.reason,
            responseStatus: err.status,
            responseBody: err.body,
          }),
        ),
      ),
    )
  })
