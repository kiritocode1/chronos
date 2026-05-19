import { Schema } from "effect"

export const JobRunStatus = Schema.Literal("running", "succeeded", "failed")

export const JobRun = Schema.Struct({
  id: Schema.String,
  jobId: Schema.String,
  workflowId: Schema.NullOr(Schema.String),
  attemptNumber: Schema.Number,
  status: JobRunStatus,
  startedAt: Schema.ValidDateFromSelf,
  finishedAt: Schema.NullOr(Schema.ValidDateFromSelf),
  stdout: Schema.NullOr(Schema.String),
  stderr: Schema.NullOr(Schema.String),
  exitCode: Schema.NullOr(Schema.Number),
  responseStatus: Schema.NullOr(Schema.Number),
  responseBody: Schema.NullOr(Schema.String),
  errorMessage: Schema.NullOr(Schema.String),
})
export type JobRun = Schema.Schema.Type<typeof JobRun>
