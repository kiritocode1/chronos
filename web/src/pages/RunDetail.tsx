import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "react-router-dom"

import { JsonViewer } from "@/components/json-viewer"
import {
  LogViewerTerminal,
  type LogEntry,
} from "@/components/log-viewer"
import { api, type JobRun } from "../lib/api"

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

const runDot = (s: JobRun["status"]) => {
  const color =
    s === "succeeded"
      ? "bg-emerald-500"
      : s === "running"
        ? "bg-blue-500 animate-pulse"
        : "bg-red-500"
  return <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
}

const Section = ({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) => (
  <section>
    <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
      {title}
    </h2>
    {children}
  </section>
)

export function RunDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: run, isLoading } = useQuery({
    queryKey: ["run", id],
    queryFn: () => api.getRun(id!),
    enabled: !!id,
  })

  if (isLoading || !run)
    return <div className="text-sm text-zinc-500">loading…</div>

  const parsedResponse = tryParseJson(run.responseBody)
  const stdoutEntries = toEntries(run.stdout, "info")
  const stderrEntries = toEntries(run.stderr, "error")

  return (
    <div className="space-y-10">
      <div>
        <Link
          to={`/jobs/${run.jobId}`}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← Job
        </Link>
        <h1 className="mt-2 flex items-center gap-3 text-2xl font-semibold tracking-tight text-white">
          {runDot(run.status)}
          Run
          <span className="font-mono text-base text-zinc-500">
            {run.id.slice(0, 8)}
          </span>
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
          <span>attempt #{run.attemptNumber}</span>
          <span>started {fmt(run.startedAt)}</span>
          <span>finished {fmt(run.finishedAt)}</span>
        </div>
      </div>

      {run.errorMessage && (
        <Section title="Error">
          <div className="rounded-md border border-red-500/20 bg-red-500/[0.05] p-3 text-sm text-red-300">
            {run.errorMessage}
          </div>
        </Section>
      )}

      {run.responseStatus !== null && (
        <Section title={`Webhook response · HTTP ${run.responseStatus}`}>
          {parsedResponse !== null ? (
            <JsonViewer data={parsedResponse as never} rootName="response" />
          ) : (
            <pre className="max-h-96 overflow-auto rounded-md border border-white/[0.06] bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
              {run.responseBody || "<empty>"}
            </pre>
          )}
        </Section>
      )}

      {(run.stdout !== null ||
        run.stderr !== null ||
        run.exitCode !== null) && (
        <Section title="Bash output">
          {run.exitCode !== null && (
            <div className="mb-3 text-xs text-zinc-500">
              exit code:{" "}
              <span
                className={
                  run.exitCode === 0
                    ? "text-emerald-400"
                    : "text-red-400"
                }
              >
                {run.exitCode}
              </span>
            </div>
          )}
          <div className="space-y-3">
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
          </div>
        </Section>
      )}
    </div>
  )
}
