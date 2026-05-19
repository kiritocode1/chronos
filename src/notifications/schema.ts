import { Schema } from "effect"

export const NotificationKind = Schema.Literal("failure")

export const Notification = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  jobId: Schema.String,
  runId: Schema.NullOr(Schema.String),
  kind: NotificationKind,
  createdAt: Schema.ValidDateFromSelf,
  seenAt: Schema.NullOr(Schema.ValidDateFromSelf),
})
export type Notification = Schema.Schema.Type<typeof Notification>
