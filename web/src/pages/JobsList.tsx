import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"

import { api, type Job } from "../lib/api"

const statusColor = (s: Job["status"]) =>
  s === "active"
    ? "bg-green-900 text-green-300"
    : s === "paused"
      ? "bg-yellow-900 text-yellow-300"
      : s === "completed"
        ? "bg-gray-800 text-gray-400"
        : "bg-red-900 text-red-300"

const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString() : "—"

export function JobsListPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => api.listJobs(),
    refetchInterval: 5_000,
  })

  if (isLoading) return <div className="text-gray-400">loading…</div>

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-white">Jobs</h1>
      {!data || data.jobs.length === 0 ? (
        <div className="rounded border border-gray-800 bg-gray-900 p-6 text-center text-gray-400">
          No jobs yet.{" "}
          <Link to="/jobs/new" className="text-purple-400 underline">
            Create one
          </Link>
          .
        </div>
      ) : (
        <table className="w-full overflow-hidden rounded border border-gray-800 bg-gray-900 text-left text-sm">
          <thead className="bg-gray-950 text-gray-400">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Mode</th>
              <th className="px-3 py-2">Schedule</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Next run</th>
            </tr>
          </thead>
          <tbody>
            {data.jobs.map((j) => (
              <tr
                key={j.id}
                className="border-t border-gray-800 hover:bg-gray-800"
              >
                <td className="px-3 py-2">
                  <Link
                    to={`/jobs/${j.id}`}
                    className="text-white hover:underline"
                  >
                    {j.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-gray-400">{j.mode}</td>
                <td className="px-3 py-2 font-mono text-xs text-gray-400">
                  {j.cron ?? fmt(j.runAt)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${statusColor(j.status)}`}
                  >
                    {j.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-400">
                  {fmt(j.nextRunAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
