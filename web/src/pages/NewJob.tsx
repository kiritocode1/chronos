import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useNavigate } from "react-router-dom"

import { CronSchedule } from "@/components/cron-schedule"
import { api, type Job } from "../lib/api"

const inputCls =
  "w-full rounded-md border border-white/[0.08] bg-transparent px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-white/20 focus:outline-none"
const monoInputCls = `${inputCls} font-mono`

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
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          New job
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Fires once at a future time, or on a recurring cron schedule.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          setErr(null)
          create.mutate()
        }}
        className="space-y-6"
      >
        <Field label="Name" hint="Human-readable label.">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        </Field>

        <Field label="Mode">
          <Tabs
            value={mode}
            onChange={(v) => setMode(v)}
            options={[
              { value: "webhook", label: "Webhook (HTTP)" },
              { value: "bash", label: "Bash (sandboxed)" },
            ]}
          />
        </Field>

        {mode === "webhook" ? (
          <>
            <Field label="URL">
              <input
                required
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={monoInputCls}
              />
            </Field>
            <Field label="Method">
              <select
                value={method}
                onChange={(e) =>
                  setMethod(e.target.value as typeof method)
                }
                className={inputCls}
              >
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                  <option key={m} value={m} className="bg-zinc-900">
                    {m}
                  </option>
                ))}
              </select>
            </Field>
            {(method === "POST" ||
              method === "PUT" ||
              method === "PATCH") && (
              <Field label="Body" hint="Sent as the raw request body.">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  className={monoInputCls}
                />
              </Field>
            )}
          </>
        ) : (
          <Field
            label="Script"
            hint="Runs in an in-process just-bash sandbox: virtual FS, network disabled by default."
          >
            <textarea
              required
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={8}
              className={monoInputCls}
            />
          </Field>
        )}

        <Field label="Schedule">
          <Tabs
            value={scheduleKind}
            onChange={(v) => setScheduleKind(v)}
            options={[
              { value: "runAt", label: "One-time" },
              { value: "cron", label: "Recurring" },
            ]}
          />
          <div className="mt-3 space-y-3">
            {scheduleKind === "runAt" ? (
              <input
                type="datetime-local"
                value={runAt}
                onChange={(e) => setRunAt(e.target.value)}
                className={inputCls}
              />
            ) : (
              <>
                <input
                  value={cron}
                  onChange={(e) => setCron(e.target.value)}
                  placeholder="*/5 * * * *"
                  className={monoInputCls}
                />
                <CronSchedule expression={cron} showNextRuns={3} />
              </>
            )}
          </div>
        </Field>

        {err && (
          <div className="rounded-md border border-red-500/20 bg-red-500/[0.05] px-3 py-2 text-sm text-red-300">
            {err}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-50"
          >
            {create.isPending ? "Creating…" : "Create"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/jobs")}
            className="rounded-md border border-white/[0.08] px-4 py-2 text-sm text-zinc-300 hover:bg-white/[0.04]"
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
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <div className="text-sm font-medium text-zinc-200">{label}</div>
      {hint && <div className="text-xs text-zinc-500">{hint}</div>}
      {children}
    </label>
  )
}

function Tabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: ReadonlyArray<{ value: T; label: string }>
}) {
  return (
    <div className="inline-flex gap-1 rounded-md bg-white/[0.04] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded px-3 py-1 text-sm transition-colors ${
            value === o.value
              ? "bg-zinc-900 text-white"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
