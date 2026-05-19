import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useParams } from "react-router-dom"

import { api, type JobRun } from "../lib/api"

const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString() : "—"

const runStatusColor = (s: JobRun["status"]) =>
  s === "succeeded"
    ? "bg-green-900 text-green-300"
    : s === "running"
      ? "bg-blue-900 text-blue-300"
      : "bg-red-900 text-red-300"

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: job } = useQuery({
    queryKey: ["job", id],
    queryFn: () => api.getJob(id!),
    enabled: !!id,
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

  if (!job) return <div className="text-gray-400">loading…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link
            to="/jobs"
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            ← Jobs
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-white">
            {job.name}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-400">
            <span className="rounded bg-gray-800 px-2 py-0.5">
              {job.mode}
            </span>
            <span className="rounded bg-gray-800 px-2 py-0.5">
              {job.status}
            </span>
            <span className="font-mono">
              {job.cron ?? fmt(job.runAt)}
            </span>
            <span>next: {fmt(job.nextRunAt)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => runNow.mutate()}
            disabled={runNow.isPending}
            className="rounded bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
          >
            Run now
          </button>
          {job.status === "active" ? (
            <button
              onClick={() => togglePause.mutate("paused")}
              className="rounded border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
            >
              Pause
            </button>
          ) : job.status === "paused" ? (
            <button
              onClick={() => togglePause.mutate("active")}
              className="rounded border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
            >
              Resume
            </button>
          ) : null}
          <button
            onClick={() => {
              if (confirm(`Delete '${job.name}'? This cannot be undone.`)) {
                del.mutate()
              }
            }}
            className="rounded border border-red-900 px-3 py-1.5 text-sm text-red-400 hover:bg-red-950"
          >
            Delete
          </button>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-gray-500">
          Payload
        </h2>
        <pre className="overflow-x-auto rounded border border-gray-800 bg-gray-950 p-3 text-xs text-gray-300">
          {JSON.stringify(job.payload, null, 2)}
        </pre>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-gray-500">
          Runs
        </h2>
        {!runs || runs.runs.length === 0 ? (
          <div className="rounded border border-gray-800 bg-gray-900 p-4 text-center text-sm text-gray-500">
            No runs yet.
          </div>
        ) : (
          <table className="w-full overflow-hidden rounded border border-gray-800 bg-gray-900 text-left text-sm">
            <thead className="bg-gray-950 text-gray-400">
              <tr>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Started</th>
                <th className="px-3 py-2">Finished</th>
                <th className="px-3 py-2">Outcome</th>
              </tr>
            </thead>
            <tbody>
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
                    className="border-t border-gray-800 hover:bg-gray-800"
                  >
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${runStatusColor(r.status)}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-400">
                      <Link
                        to={`/runs/${r.id}`}
                        className="hover:underline"
                      >
                        {fmt(r.startedAt)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-gray-400">
                      {fmt(r.finishedAt)}
                    </td>
                    <td className="px-3 py-2 text-gray-300">{outcome}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
