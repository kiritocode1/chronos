import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"
import { Link, NavLink, useNavigate } from "react-router-dom"

import { api, type Me } from "../lib/api"

const navLink = ({ isActive }: { isActive: boolean }) =>
  `text-sm transition-colors ${
    isActive
      ? "text-white"
      : "text-zinc-500 hover:text-white"
  }`

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
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-black/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link
              to="/jobs"
              className="text-sm font-semibold tracking-tight text-white"
            >
              Chronos
            </Link>
            <nav className="flex items-center gap-5">
              <NavLink to="/jobs" className={navLink}>
                Jobs
              </NavLink>
              <NavLink to="/api-ref" className={navLink}>
                API
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/jobs/new"
              className="rounded-md bg-white px-3 py-1 text-sm font-medium text-black transition-colors hover:bg-zinc-200"
            >
              New job
            </Link>
            <div className="relative">
              <button
                onClick={() => setShowNotifs((s) => !s)}
                className="relative rounded-md px-2 py-1 text-sm text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                Alerts
                {unseen && unseen.count > 0 ? (
                  <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500/90 px-1 text-[10px] font-medium text-white">
                    {unseen.count}
                  </span>
                ) : null}
              </button>
              {showNotifs && (
                <div className="absolute right-0 z-30 mt-2 w-96 overflow-hidden rounded-lg border border-white/[0.08] bg-zinc-950 shadow-2xl">
                  <div className="max-h-96 overflow-y-auto">
                    {!notifs || notifs.notifications.length === 0 ? (
                      <div className="p-5 text-center text-sm text-zinc-500">
                        No notifications
                      </div>
                    ) : (
                      <ul className="divide-y divide-white/[0.06]">
                        {notifs.notifications.map((n) => (
                          <li
                            key={n.id}
                            className={`flex items-start justify-between px-4 py-3 text-sm transition-colors hover:bg-white/[0.03] ${
                              n.seenAt ? "opacity-50" : ""
                            }`}
                          >
                            <div className="min-w-0 flex-1 pr-3">
                              <div className="flex items-center gap-2 text-white">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                                Job failure
                              </div>
                              <div className="mt-1 flex gap-2 text-xs text-zinc-500">
                                <Link
                                  to={`/jobs/${n.jobId}`}
                                  onClick={() => setShowNotifs(false)}
                                  className="hover:text-zinc-300"
                                >
                                  job
                                </Link>
                                {n.runId && (
                                  <>
                                    <span>·</span>
                                    <Link
                                      to={`/runs/${n.runId}`}
                                      onClick={() => setShowNotifs(false)}
                                      className="hover:text-zinc-300"
                                    >
                                      run
                                    </Link>
                                  </>
                                )}
                                <span>·</span>
                                <span>
                                  {new Date(n.createdAt).toLocaleString()}
                                </span>
                              </div>
                            </div>
                            {!n.seenAt && (
                              <button
                                onClick={() => markSeen.mutate(n.id)}
                                className="shrink-0 text-xs text-zinc-500 hover:text-white"
                              >
                                mark read
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="ml-1 flex items-center gap-3 border-l border-white/[0.06] pl-3 text-sm">
              <span className="text-zinc-500">{user.email}</span>
              <button
                onClick={() => signOutM.mutate()}
                className="text-zinc-500 hover:text-white"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
