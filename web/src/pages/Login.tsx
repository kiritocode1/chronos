import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { api } from "../lib/api"

export function LoginPage() {
  const [tab, setTab] = useState<"signin" | "signup">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [err, setErr] = useState<string | null>(null)
  const qc = useQueryClient()

  const m = useMutation({
    mutationFn: async () => {
      if (tab === "signin") return api.signIn(email, password)
      return api.signUp(email, password, name)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] })
    },
    onError: (e) => setErr(String(e instanceof Error ? e.message : e)),
  })

  return (
    <div className="grid h-full place-items-center px-6">
      <div className="w-full max-w-sm rounded-lg border border-gray-800 bg-gray-900 p-6">
        <h1 className="mb-4 text-2xl font-semibold text-white">Chronos</h1>
        <div className="mb-4 flex border-b border-gray-800">
          {(["signin", "signup"] as const).map((t) => (
            <button
              key={t}
              className={`flex-1 px-3 py-2 text-sm ${
                tab === t
                  ? "border-b-2 border-purple-500 text-white"
                  : "text-gray-400"
              }`}
              onClick={() => {
                setTab(t)
                setErr(null)
              }}
            >
              {t === "signin" ? "Sign in" : "Sign up"}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            setErr(null)
            m.mutate()
          }}
          className="space-y-3"
        >
          {tab === "signup" && (
            <input
              required
              autoFocus
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white"
            />
          )}
          <input
            required
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white"
          />
          <input
            required
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white"
          />
          {err && (
            <div className="rounded bg-red-950 px-3 py-2 text-sm text-red-300">
              {err}
            </div>
          )}
          <button
            type="submit"
            disabled={m.isPending}
            className="w-full rounded bg-purple-600 py-2 font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {m.isPending ? "…" : tab === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  )
}
