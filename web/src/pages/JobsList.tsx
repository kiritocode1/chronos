import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "react-router-dom"

import { api, type Job } from "../lib/api"

const statusDot = (s: Job["status"]) => {
  const color =
    s === "active"
      ? "bg-emerald-500"
      : s === "paused"
        ? "bg-amber-500"
        : s === "completed"
          ? "bg-zinc-500"
          : "bg-red-500"
  return <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
}

const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString() : "—"

export function JobsListPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => api.listJobs(),
    refetchInterval: 5_000,
  })

  if (isLoading)
    return <div className="text-sm text-zinc-500">loading…</div>

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">
            Jobs
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {data?.jobs.length ?? 0} total
          </p>
        </div>
      </div>

      {!data || data.jobs.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-zinc-950 p-10 text-center">
          <p className="text-sm text-zinc-400">No jobs yet.</p>
          <Link
            to="/jobs/new"
            className="mt-3 inline-block rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-zinc-200"
          >
            Create one
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/[0.06]">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.02] text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Mode</th>
                <th className="px-4 py-2.5 font-medium">Schedule</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Next run</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {data.jobs.map((j) => (
                <tr
                  key={j.id}
                  onClick={() => navigate(`/jobs/${j.id}`)}
                  className="cursor-pointer transition-colors hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3 text-white">{j.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                    {j.mode}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                    {j.cron ?? fmt(j.runAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-300">
                      {statusDot(j.status)}
                      {j.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {fmt(j.nextRunAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
