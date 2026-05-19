import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "react-router-dom"

import { api } from "../lib/api"

const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString() : "—"

export function RunDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: run, isLoading } = useQuery({
    queryKey: ["run", id],
    queryFn: () => api.getRun(id!),
    enabled: !!id,
  })

  if (isLoading || !run) return <div className="text-gray-400">loading…</div>

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/jobs/${run.jobId}`}
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          ← Job
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-white">
          Run · {run.id.slice(0, 8)}
        </h1>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-400">
          <span className="rounded bg-gray-800 px-2 py-0.5">{run.status}</span>
          <span>attempt #{run.attemptNumber}</span>
          <span>started: {fmt(run.startedAt)}</span>
          <span>finished: {fmt(run.finishedAt)}</span>
        </div>
      </div>

      {run.errorMessage && (
        <Block label="Error">
          <pre className="text-sm text-red-300">{run.errorMessage}</pre>
        </Block>
      )}

      {run.responseStatus !== null && (
        <Block label={`Webhook response · ${run.responseStatus}`}>
          <pre className="max-h-96 overflow-auto text-xs text-gray-300">
            {run.responseBody ?? "<empty>"}
          </pre>
        </Block>
      )}

      {(run.stdout || run.stderr || run.exitCode !== null) && (
        <>
          {run.exitCode !== null && (
            <Block label={`Bash exit code · ${run.exitCode}`}>
              <span className="text-xs text-gray-500">
                Non-zero exit codes mark the run as failed.
              </span>
            </Block>
          )}
          <Block label="stdout">
            <pre className="max-h-96 overflow-auto text-xs text-gray-300">
              {run.stdout || "<empty>"}
            </pre>
          </Block>
          <Block label="stderr">
            <pre className="max-h-96 overflow-auto text-xs text-yellow-300">
              {run.stderr || "<empty>"}
            </pre>
          </Block>
        </>
      )}
    </div>
  )
}

function Block({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-gray-500">
        {label}
      </h2>
      <div className="rounded border border-gray-800 bg-gray-950 p-3">
        {children}
      </div>
    </section>
  )
}
