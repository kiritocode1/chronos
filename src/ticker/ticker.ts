import { and, asc, eq, isNotNull, lte, sql } from "drizzle-orm"
import { Cron } from "croner"
import { Duration, Effect, Schedule, Schema } from "effect"

import { Db } from "../db/client.ts"
import { jobs } from "../db/schema.ts"
import { Job } from "../jobs/schema.ts"
import { dispatchJob } from "../workflows/dispatch.ts"

const TICK_INTERVAL = Duration.seconds(1)
const BATCH_SIZE = 50

const claimDueJobs = Effect.gen(function* () {
  const db = yield* Db

  return yield* db.transaction((tx) =>
    Effect.gen(function* () {
      const raw = yield* tx
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.status, "active"),
            isNotNull(jobs.nextRunAt),
            lte(jobs.nextRunAt, sql`now()`),
          ),
        )
        .orderBy(asc(jobs.nextRunAt))
        .limit(BATCH_SIZE)
        .for("update", { skipLocked: true })

      if (raw.length === 0) return [] as ReadonlyArray<Job>

      const claimed = yield* Effect.forEach(raw, (r) =>
        Schema.decodeUnknown(Job)(r),
      )

      for (const j of claimed) {
        if (j.cron) {
          const next = new Cron(j.cron).nextRun(new Date())
          yield* tx
            .update(jobs)
            .set({ nextRunAt: next, updatedAt: new Date() })
            .where(eq(jobs.id, j.id))
        } else {
          yield* tx
            .update(jobs)
            .set({
              status: "completed",
              nextRunAt: null,
              updatedAt: new Date(),
            })
            .where(eq(jobs.id, j.id))
        }
      }

      return claimed
    }),
  )
})

const tickOnce = Effect.gen(function* () {
  const jobsClaimed = yield* claimDueJobs
  if (jobsClaimed.length > 0) {
    yield* Effect.log(`ticker: claimed ${jobsClaimed.length} jobs`)
  }
  yield* Effect.forEach(jobsClaimed, (j) => dispatchJob(j), {
    concurrency: 10,
    discard: true,
  })
}).pipe(
  Effect.catchAll((e) =>
    Effect.logError(`ticker: error`, e instanceof Error ? e : String(e)),
  ),
)

export const tickerLoop = tickOnce.pipe(
  Effect.repeat(Schedule.spaced(TICK_INTERVAL)),
)
