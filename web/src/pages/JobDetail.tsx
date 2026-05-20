import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useParams } from "react-router-dom"

import { CronSchedule } from "@/components/cron-schedule"
import { JsonViewer } from "@/components/json-viewer"
import { api, type JobRun } from "../lib/api"

const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString() : "—"

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

const Tag = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-xs text-zinc-300">
    {children}
  </span>
)

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: job } = useQuery({
    queryKey: ["job", id],
    queryFn: () => api.getJob(id!),
    enabled: !!id,
    refetchInterval: 5_000,
  })

  const { data: runs } = useQuery({
    queryKey: ["runs", id],
    queryFn: () => api.listRuns(id!),
    enabled: !!id,
    refetchInterval: 3_000,
  })

  const togglePause = useMutation({
    mutationFn: (next: "active" | "paused") =>
      api.patchJob(id!, { status: next }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job", id] }),
  })

  const runNow = useMutation({
    mutationFn: () => api.runJob(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs", id] }),
  })

  const del = useMutation({
    mutationFn: () => api.deleteJob(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] })
      navigate("/jobs")
    },
  })

  if (!job) return <div className="text-sm text-zinc-500">loading…</div>

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/jobs"
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            ← Jobs
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            {job.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Tag>{job.mode}</Tag>
            <Tag>{job.status}</Tag>
            <span className="text-xs text-zinc-500">
              next: {fmt(job.nextRunAt)}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => runNow.mutate()}
            disabled={runNow.isPending}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-zinc-200 disabled:opacity-50"
          >
            Run now
          </button>
          {job.status === "active" && (
            <button
              onClick={() => togglePause.mutate("paused")}
              className="rounded-md border border-white/[0.08] px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/[0.04]"
            >
              Pause
            </button>
          )}
          {job.status === "paused" && (
            <button
              onClick={() => togglePause.mutate("active")}
              className="rounded-md border border-white/[0.08] px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/[0.04]"
            >
              Resume
            </button>
          )}
          <button
            onClick={() => {
              if (confirm(`Delete '${job.name}'? This cannot be undone.`)) {
                del.mutate()
              }
            }}
            className="rounded-md border border-white/[0.08] px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/[0.08]"
          >
            Delete
          </button>
        </div>
      </div>

      {job.cron && (
        <Section title="Schedule">
          <CronSchedule
            title={job.cron}
            expression={job.cron}
            showNextRuns={5}
          />
        </Section>
      )}

      <Section title="Payload">
        <JsonViewer
          data={job.payload as never}
          rootName="payload"
          defaultExpanded={true}
        />
      </Section>

      <Section title="Retry policy">
        <JsonViewer
          data={job.retryPolicy as never}
          rootName="retryPolicy"
        />
      </Section>

      <Section title="Runs">
        {!runs || runs.runs.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-zinc-950 p-6 text-center text-sm text-zinc-500">
            No runs yet. The ticker checks every second.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/[0.06]">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.02] text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Started</th>
                  <th className="px-4 py-2.5 font-medium">Finished</th>
                  <th className="px-4 py-2.5 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {runs.runs.map((r) => {
                  const outcome =
                    r.errorMessage ??
                    (r.responseStatus !== null
                      ? `HTTP ${r.responseStatus}`
                      : r.exitCode !== null
                        ? `exit ${r.exitCode}`
                        : "—")
                  return (
                    <tr
                      key={r.id}
                      onClick={() => navigate(`/runs/${r.id}`)}
                      className="cursor-pointer transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-300">
                          {runDot(r.status)}
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-400">
                        {fmt(r.startedAt)}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-400">
                        {fmt(r.finishedAt)}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-300">
                        {outcome}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}
