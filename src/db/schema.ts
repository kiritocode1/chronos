import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"

/**
 * Reference to Better Auth's `user` table. Better Auth owns this schema
 * (created by `bunx @better-auth/cli migrate`). We declare a minimal stub here
 * solely for FK targeting; it MUST be excluded from drizzle-kit migrations
 * via `tablesFilter` in drizzle.config.ts.
 */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
})

export const jobs = pgTable(
  "jobs",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mode: text("mode").notNull(),
    payload: jsonb("payload").notNull(),
    cron: text("cron"),
    runAt: timestamp("run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    retryPolicy: jsonb("retry_policy")
      .notNull()
      .default(
        sql`'{"maxAttempts":3,"baseMs":1000,"maxMs":60000,"jitter":true}'::jsonb`,
      ),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("jobs_user_id_idx").on(t.userId),
    index("jobs_due_idx").on(t.nextRunAt).where(sql`status = 'active'`),
    check("jobs_mode_check", sql`${t.mode} IN ('webhook', 'bash')`),
    check(
      "jobs_status_check",
      sql`${t.status} IN ('active', 'paused', 'completed', 'failed')`,
    ),
    check(
      "jobs_schedule_check",
      sql`(${t.cron} IS NULL) <> (${t.runAt} IS NULL)`,
    ),
  ],
)

export const jobRuns = pgTable(
  "job_runs",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    workflowId: text("workflow_id"),
    attemptNumber: integer("attempt_number").notNull().default(1),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    stdout: text("stdout"),
    stderr: text("stderr"),
    exitCode: integer("exit_code"),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    errorMessage: text("error_message"),
  },
  (t) => [
    index("job_runs_job_id_idx").on(t.jobId, t.startedAt.desc()),
    check(
      "job_runs_status_check",
      sql`${t.status} IN ('running', 'succeeded', 'failed')`,
    ),
  ],
)

export const notifications = pgTable(
  "notifications",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => jobRuns.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    seenAt: timestamp("seen_at", { withTimezone: true }),
  },
  (t) => [
    index("notifications_user_unseen_idx")
      .on(t.userId)
      .where(sql`seen_at IS NULL`),
    check("notifications_kind_check", sql`${t.kind} IN ('failure')`),
  ],
)

// Row types inferred from the schema (snake_case columns → camelCase TS).
export type JobRow = typeof jobs.$inferSelect
export type JobInsert = typeof jobs.$inferInsert
export type JobRunRow = typeof jobRuns.$inferSelect
export type JobRunInsert = typeof jobRuns.$inferInsert
export type NotificationRow = typeof notifications.$inferSelect
export type NotificationInsert = typeof notifications.$inferInsert
