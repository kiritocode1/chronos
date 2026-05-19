const base = ""

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(base + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(
      `${res.status} ${res.statusText}${text ? `: ${text}` : ""}`,
    )
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export interface Me {
  user: { id: string; name: string; email: string }
}

export interface Job {
  id: string
  userId: string
  name: string
  mode: "webhook" | "bash"
  payload:
    | {
        kind: "webhook"
        url: string
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
        headers?: Record<string, string>
        body?: string
        timeoutMs?: number
      }
    | {
        kind: "bash"
        script: string
        timeoutMs?: number
        env?: Record<string, string>
        allowedUrls?: string[]
      }
  cron: string | null
  runAt: string | null
  nextRunAt: string | null
  retryPolicy: {
    maxAttempts: number
    baseMs: number
    maxMs: number
    jitter: boolean
  }
  status: "active" | "paused" | "completed" | "failed"
  createdAt: string
  updatedAt: string
}

export interface JobRun {
  id: string
  jobId: string
  workflowId: string | null
  attemptNumber: number
  status: "running" | "succeeded" | "failed"
  startedAt: string
  finishedAt: string | null
  stdout: string | null
  stderr: string | null
  exitCode: number | null
  responseStatus: number | null
  responseBody: string | null
  errorMessage: string | null
}

export interface Notification {
  id: string
  userId: string
  jobId: string
  runId: string | null
  kind: "failure"
  createdAt: string
  seenAt: string | null
}

export const api = {
  // auth
  signUp: (email: string, password: string, name: string) =>
    request<{ user: Me["user"] }>("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),
  signIn: (email: string, password: string) =>
    request<{ user: Me["user"] }>("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  signOut: () =>
    request<void>("/api/auth/sign-out", { method: "POST" }),
  me: () => request<Me>("/api/me"),

  // jobs
  listJobs: () =>
    request<{ jobs: Job[]; limit: number; offset: number }>(
      "/api/jobs?limit=200",
    ),
  createJob: (input: {
    name: string
    payload: Job["payload"]
    schedule: { cron: string } | { runAt: string }
    retryPolicy?: Job["retryPolicy"]
  }) =>
    request<Job>("/api/jobs", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getJob: (id: string) => request<Job>(`/api/jobs/${id}`),
  patchJob: (id: string, patch: Partial<{
    name: string
    payload: Job["payload"]
    schedule: { cron: string } | { runAt: string }
    retryPolicy: Job["retryPolicy"]
    status: "active" | "paused"
  }>) =>
    request<Job>(`/api/jobs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteJob: (id: string) =>
    request<void>(`/api/jobs/${id}`, { method: "DELETE" }),
  runJob: (id: string) =>
    request<{ runId: string; executionId: string; mode: string }>(
      `/api/jobs/${id}/run`,
      { method: "POST" },
    ),

  // runs
  listRuns: (jobId: string) =>
    request<{ runs: JobRun[] }>(`/api/jobs/${jobId}/runs?limit=100`),
  getRun: (runId: string) => request<JobRun>(`/api/runs/${runId}`),

  // notifications
  listNotifications: (unseenOnly = false) =>
    request<{ notifications: Notification[] }>(
      `/api/notifications${unseenOnly ? "?unseenOnly=true" : ""}`,
    ),
  unseenCount: () =>
    request<{ count: number }>("/api/notifications/unseen-count"),
  markSeen: (id: string) =>
    request<void>(`/api/notifications/${id}/seen`, { method: "POST" }),
}
