import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"
import { Link, useNavigate } from "react-router-dom"

import { api, type Me } from "../lib/api"

export function Shell({
  user,
  children,
}: {
  user: Me["user"]
  children: ReactNode
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [showNotifs, setShowNotifs] = useState(false)

  const { data: unseen } = useQuery({
    queryKey: ["unseen-count"],
    queryFn: () => api.unseenCount(),
    refetchInterval: 30_000,
  })

  const { data: notifs } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.listNotifications(),
    enabled: showNotifs,
  })

  const signOutM = useMutation({
    mutationFn: () => api.signOut(),
    onSuccess: () => {
      qc.clear()
      navigate("/")
    },
  })

  const markSeen = useMutation({
    mutationFn: (id: string) => api.markSeen(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unseen-count"] })
      qc.invalidateQueries({ queryKey: ["notifications"] })
    },
  })

  return (
    <div className="min-h-full">
      <header className="border-b border-gray-800 bg-gray-950">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/jobs" className="text-lg font-semibold text-white">
            Chronos
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/jobs" className="text-gray-300 hover:text-white">
              Jobs
            </Link>
            <Link to="/api-ref" className="text-gray-300 hover:text-white">
              API
            </Link>
            <Link
              to="/jobs/new"
              className="rounded bg-purple-600 px-3 py-1 text-white hover:bg-purple-700"
            >
              New job
            </Link>
            <div className="relative">
              <button
                onClick={() => setShowNotifs((s) => !s)}
                className="relative rounded px-2 py-1 text-gray-300 hover:bg-gray-800 hover:text-white"
              >
                Alerts
                {unseen && unseen.count > 0 ? (
                  <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 text-xs text-white">
                    {unseen.count}
                  </span>
                ) : null}
              </button>
              {showNotifs && (
                <div className="absolute right-0 z-10 mt-2 w-96 rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
                  <div className="max-h-96 overflow-y-auto">
                    {!notifs || notifs.notifications.length === 0 ? (
                      <div className="p-4 text-sm text-gray-500">
                        No notifications.
                      </div>
                    ) : (
                      notifs.notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`flex items-start justify-between border-b border-gray-800 px-4 py-3 text-sm ${
                            n.seenAt ? "opacity-60" : ""
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-red-400">Job failure</div>
                            <Link
                              to={`/jobs/${n.jobId}`}
                              onClick={() => setShowNotifs(false)}
                              className="text-xs text-gray-400 underline"
                            >
                              {n.jobId.slice(0, 8)}
                            </Link>
                            {n.runId && (
                              <>
                                {" · "}
                                <Link
                                  to={`/runs/${n.runId}`}
                                  onClick={() => setShowNotifs(false)}
                                  className="text-xs text-gray-400 underline"
                                >
                                  view run
                                </Link>
                              </>
                            )}
                            <div className="text-xs text-gray-500">
                              {new Date(n.createdAt).toLocaleString()}
                            </div>
                          </div>
                          {!n.seenAt && (
                            <button
                              onClick={() => markSeen.mutate(n.id)}
                              className="ml-2 text-xs text-gray-400 hover:text-white"
                            >
                              mark read
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <span className="text-gray-500">|</span>
            <span className="text-gray-400">{user.email}</span>
            <button
              onClick={() => signOutM.mutate()}
              className="text-gray-400 hover:text-white"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
    </div>
  )
}
