import { ApiRefTable } from "@/components/api-ref-table"

export function ApiRefPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">API reference</h1>
        <p className="mt-1 text-sm text-gray-400">
          All routes except <code>/api/auth/*</code> require a Better Auth
          session cookie. JSON request/response bodies use camelCase.
        </p>
      </div>

      <ApiRefTable
        title="POST /api/jobs"
        props={[
          {
            name: "name",
            type: "string",
            required: true,
            description: "Human-readable label.",
          },
          {
            name: "payload",
            type: "WebhookPayload | BashPayload",
            required: true,
            description:
              "Mode-specific config. Discriminated by `kind: 'webhook' | 'bash'`.",
          },
          {
            name: "schedule",
            type: "{ cron: string } | { runAt: string }",
            required: true,
            description:
              "Exactly one. `cron` is a standard 5-field expression; `runAt` is an ISO timestamp.",
          },
          {
            name: "retryPolicy",
            type: "RetryPolicy",
            description:
              "Defaults to `{ maxAttempts: 3, baseMs: 1000, maxMs: 60000, jitter: true }`.",
          },
        ]}
      />

      <ApiRefTable
        title="GET /api/jobs"
        props={[
          {
            name: "limit",
            type: "number",
            description: "Query string. 1-200, default 50.",
          },
          {
            name: "offset",
            type: "number",
            description: "Query string. Default 0.",
          },
        ]}
      />

      <ApiRefTable
        title="PATCH /api/jobs/:id"
        props={[
          { name: "name", type: "string" },
          { name: "payload", type: "WebhookPayload | BashPayload" },
          {
            name: "schedule",
            type: "{ cron: string } | { runAt: string }",
          },
          { name: "retryPolicy", type: "RetryPolicy" },
          {
            name: "status",
            type: "'active' | 'paused'",
            description: "Pause/resume scheduling.",
          },
        ]}
      />

      <ApiRefTable
        title="POST /api/jobs/:id/run"
        props={[
          {
            name: "(no body)",
            type: "void",
            description:
              "Returns 202 with `{ runId, executionId, mode }` immediately. Workflow runs asynchronously in the cluster.",
          },
        ]}
      />

      <ApiRefTable
        title="GET /api/jobs/:id/runs"
        props={[
          { name: "limit", type: "number" },
          { name: "offset", type: "number" },
        ]}
      />

      <ApiRefTable
        title="GET /api/runs/:id"
        props={[
          {
            name: "(returns)",
            type: "JobRun",
            description:
              "Full run row including stdout, stderr, exit code, response body, error message.",
          },
        ]}
      />

      <ApiRefTable
        title="GET /api/notifications"
        props={[
          { name: "unseenOnly", type: "boolean" },
          { name: "limit", type: "number" },
          { name: "offset", type: "number" },
        ]}
      />

      <ApiRefTable
        title="POST /api/notifications/:id/seen"
        props={[
          {
            name: "(no body)",
            type: "void",
            description: "Marks the notification as seen. Returns 204.",
          },
        ]}
      />
    </div>
  )
}
