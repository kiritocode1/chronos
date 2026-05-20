import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "react-router-dom"

import { JsonViewer } from "@/components/json-viewer"
import {
  LogViewerTerminal,
  type LogEntry,
} from "@/components/log-viewer"
import { api } from "../lib/api"

const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString() : "—"

const tryParseJson = (s: string | null): unknown | null => {
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

const toEntries = (
  text: string | null,
  level: LogEntry["level"],
): LogEntry[] =>
  (text ?? "")
    .split(/\r?\n/)
    .filter((line, i, arr) => !(i === arr.length - 1 && line === ""))
    .map((message) => ({ level, message }))

export function RunDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: run, isLoading } = useQuery({
    queryKey: ["run", id],
    queryFn: () => api.getRun(id!),
    enabled: !!id,
  })

  if (isLoading || !run) return <div className="text-gray-400">loading…</div>

  const parsedResponse = tryParseJson(run.responseBody)
  const stdoutEntries = toEntries(run.stdout, "info")
  const stderrEntries = toEntries(run.stderr, "error")

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
        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-gray-500">
            Error
          </h2>
          <div className="rounded border border-red-900 bg-red-950 p-3 text-sm text-red-300">
            {run.errorMessage}
          </div>
        </section>
      )}

      {run.responseStatus !== null && (
        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-gray-500">
            Webhook response · HTTP {run.responseStatus}
          </h2>
          {parsedResponse !== null ? (
            <JsonViewer data={parsedResponse as never} rootName="response" />
          ) : (
            <pre className="max-h-96 overflow-auto rounded border border-gray-800 bg-gray-950 p-3 text-xs text-gray-300">
              {run.responseBody || "<empty>"}
            </pre>
          )}
        </section>
      )}

      {(run.stdout !== null || run.stderr !== null || run.exitCode !== null) && (
        <section className="space-y-4">
          {run.exitCode !== null && (
            <div className="text-sm text-gray-400">
              Bash exit code:{" "}
              <span
                className={
                  run.exitCode === 0 ? "text-green-400" : "text-red-400"
                }
              >
                {run.exitCode}
              </span>
            </div>
          )}
          {stdoutEntries.length > 0 && (
            <LogViewerTerminal
              title="stdout"
              entries={stdoutEntries}
              lineNumbers
              timestamps={false}
            />
          )}
          {stderrEntries.length > 0 && (
            <LogViewerTerminal
              title="stderr"
              entries={stderrEntries}
              lineNumbers
              timestamps={false}
            />
          )}
        </section>
      )}
    </div>
  )
}
