import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useNavigate } from "react-router-dom"

import { api, type Job } from "../lib/api"

export function NewJobPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [name, setName] = useState("")
  const [mode, setMode] = useState<"webhook" | "bash">("webhook")
  const [scheduleKind, setScheduleKind] = useState<"runAt" | "cron">("runAt")
  const [runAt, setRunAt] = useState(
    new Date(Date.now() + 60_000).toISOString().slice(0, 16),
  )
  const [cron, setCron] = useState("*/5 * * * *")

  // webhook
  const [url, setUrl] = useState("https://httpbin.org/get")
  const [method, setMethod] = useState<
    "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  >("GET")
  const [body, setBody] = useState("")

  // bash
  const [script, setScript] = useState("echo hello")

  const [err, setErr] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => {
      const payload: Job["payload"] =
        mode === "webhook"
          ? {
              kind: "webhook",
              url,
              method,
              ...(body ? { body } : {}),
            }
          : { kind: "bash", script }
      const schedule =
        scheduleKind === "cron"
          ? { cron }
          : { runAt: new Date(runAt).toISOString() }
      return api.createJob({ name, payload, schedule })
    },
    onSuccess: (j) => {
      qc.invalidateQueries({ queryKey: ["jobs"] })
      navigate(`/jobs/${j.id}`)
    },
    onError: (e) => setErr(String(e instanceof Error ? e.message : e)),
  })

  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold text-white">New job</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setErr(null)
          create.mutate()
        }}
        className="space-y-4 rounded border border-gray-800 bg-gray-900 p-6"
      >
        <Field label="Name">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white"
          />
        </Field>

        <Field label="Mode">
          <select
            value={mode}
            onChange={(e) =>
              setMode(e.target.value as "webhook" | "bash")
            }
            className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white"
          >
            <option value="webhook">Webhook (HTTP)</option>
            <option value="bash">Bash script (sandboxed)</option>
          </select>
        </Field>

        {mode === "webhook" ? (
          <>
            <Field label="URL">
              <input
                required
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-sm text-white"
              />
            </Field>
            <Field label="Method">
              <select
                value={method}
                onChange={(e) =>
                  setMethod(e.target.value as typeof method)
                }
                className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white"
              >
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
            {(method === "POST" ||
              method === "PUT" ||
              method === "PATCH") && (
              <Field label="Body (raw)">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-sm text-white"
                />
              </Field>
            )}
          </>
        ) : (
          <Field label="Script">
            <textarea
              required
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={8}
              className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-sm text-white"
            />
            <p className="mt-1 text-xs text-gray-500">
              Runs in an in-process sandbox (just-bash). No filesystem or
              network unless allowed explicitly.
            </p>
          </Field>
        )}

        <Field label="Schedule">
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-400">
              <input
                type="radio"
                checked={scheduleKind === "runAt"}
                onChange={() => setScheduleKind("runAt")}
                className="mr-1"
              />
              One-time
            </label>
            <label className="text-sm text-gray-400">
              <input
                type="radio"
                checked={scheduleKind === "cron"}
                onChange={() => setScheduleKind("cron")}
                className="mr-1"
              />
              Recurring (cron)
            </label>
          </div>
          {scheduleKind === "runAt" ? (
            <input
              type="datetime-local"
              value={runAt}
              onChange={(e) => setRunAt(e.target.value)}
              className="mt-2 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white"
            />
          ) : (
            <input
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              placeholder="*/5 * * * *"
              className="mt-2 w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-sm text-white"
            />
          )}
        </Field>

        {err && (
          <div className="rounded bg-red-950 px-3 py-2 text-sm text-red-300">
            {err}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded bg-purple-600 px-4 py-2 font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {create.isPending ? "Creating…" : "Create"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/jobs")}
            className="rounded border border-gray-700 px-4 py-2 text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="mb-1 text-sm text-gray-300">{label}</div>
      {children}
    </label>
  )
}
