import { WorkflowEngine } from "@effect/workflow/WorkflowEngine"
import { Effect } from "effect"

import { JobRunsRepo } from "../runs/repo.ts"
import type { Job } from "../jobs/schema.ts"
import { BashJob } from "./bash-job.ts"
import { WebhookJob } from "./webhook-job.ts"

/**
 * Insert a `job_runs` row and fire the corresponding workflow.
 * Used by both the ticker (scheduled execution) and the manual trigger endpoint.
 */
export const dispatchJob = (job: Job) =>
  Effect.gen(function* () {
    const runs = yield* JobRunsRepo
    const engine = yield* WorkflowEngine

    const executionId = `${job.id}.${Date.now()}`
    const { id: runId } = yield* runs.start({
      jobId: job.id,
      workflowId: executionId,
    })

    if (job.payload.kind === "webhook") {
      yield* Effect.orDie(
        engine.execute(WebhookJob, {
          executionId,
          payload: {
            runId,
            jobId: job.id,
            userId: job.userId,
            url: job.payload.url,
            method: job.payload.method,
            headers: job.payload.headers ?? {},
            body: job.payload.body ?? null,
            timeoutMs: job.payload.timeoutMs ?? 30_000,
            retryPolicy: job.retryPolicy,
          },
          discard: true,
        }),
      )
    } else {
      yield* Effect.orDie(
        engine.execute(BashJob, {
          executionId,
          payload: {
            runId,
            jobId: job.id,
            userId: job.userId,
            script: job.payload.script,
            timeoutMs: job.payload.timeoutMs ?? 30_000,
            env: job.payload.env ?? {},
            allowedUrls: job.payload.allowedUrls ?? [],
            retryPolicy: job.retryPolicy,
          },
          discard: true,
        }),
      )
    }

    return { runId, executionId, mode: job.payload.kind }
  })
