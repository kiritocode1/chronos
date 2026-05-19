import { Schema } from "effect"

export const WebhookPayload = Schema.Struct({
  kind: Schema.Literal("webhook"),
  url: Schema.String,
  method: Schema.Literal("GET", "POST", "PUT", "PATCH", "DELETE"),
  headers: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.String }),
  ),
  body: Schema.optional(Schema.String),
  timeoutMs: Schema.optional(Schema.Number),
})
export type WebhookPayload = Schema.Schema.Type<typeof WebhookPayload>

export const BashPayload = Schema.Struct({
  kind: Schema.Literal("bash"),
  script: Schema.String,
  timeoutMs: Schema.optional(Schema.Number),
  env: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.String }),
  ),
  allowedUrls: Schema.optional(Schema.Array(Schema.String)),
})
export type BashPayload = Schema.Schema.Type<typeof BashPayload>

export const JobPayload = Schema.Union(WebhookPayload, BashPayload)
export type JobPayload = Schema.Schema.Type<typeof JobPayload>

export const Schedule = Schema.Union(
  Schema.Struct({ cron: Schema.String }),
  Schema.Struct({ runAt: Schema.DateFromString }),
)
export type Schedule = Schema.Schema.Type<typeof Schedule>

export const RetryPolicy = Schema.Struct({
  maxAttempts: Schema.Number,
  baseMs: Schema.Number,
  maxMs: Schema.Number,
  jitter: Schema.Boolean,
})
export type RetryPolicy = Schema.Schema.Type<typeof RetryPolicy>

export const JobMode = Schema.Literal("webhook", "bash")
export const JobStatus = Schema.Literal("active", "paused", "completed", "failed")

export const Job = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  name: Schema.String,
  mode: JobMode,
  payload: JobPayload,
  cron: Schema.NullOr(Schema.String),
  runAt: Schema.NullOr(Schema.ValidDateFromSelf),
  nextRunAt: Schema.NullOr(Schema.ValidDateFromSelf),
  retryPolicy: RetryPolicy,
  status: JobStatus,
  createdAt: Schema.ValidDateFromSelf,
  updatedAt: Schema.ValidDateFromSelf,
})
export type Job = Schema.Schema.Type<typeof Job>

export const CreateJob = Schema.Struct({
  name: Schema.NonEmptyString,
  payload: JobPayload,
  schedule: Schedule,
  retryPolicy: Schema.optional(RetryPolicy),
})
export type CreateJob = Schema.Schema.Type<typeof CreateJob>

export const UpdateJob = Schema.Struct({
  name: Schema.optional(Schema.NonEmptyString),
  payload: Schema.optional(JobPayload),
  schedule: Schema.optional(Schedule),
  retryPolicy: Schema.optional(RetryPolicy),
  status: Schema.optional(Schema.Literal("active", "paused")),
})
export type UpdateJob = Schema.Schema.Type<typeof UpdateJob>
