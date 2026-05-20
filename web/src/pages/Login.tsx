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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
    onError: (e) => setErr(String(e instanceof Error ? e.message : e)),
  })

  return (
    <div className="grid h-full place-items-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Chronos
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Distributed job scheduler
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-zinc-950 p-6">
          <div className="mb-5 flex gap-1 rounded-md bg-white/[0.04] p-1">
            {(["signin", "signup"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t)
                  setErr(null)
                }}
                className={`flex-1 rounded px-3 py-1.5 text-sm transition-colors ${
                  tab === t
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
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
              <Input
                placeholder="Name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {err && (
              <div className="rounded-md border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-sm text-red-300">
                {err}
              </div>
            )}
            <button
              type="submit"
              disabled={m.isPending}
              className="w-full rounded-md bg-white py-2 text-sm font-medium text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {m.isPending
                ? "…"
                : tab === "signin"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-md border border-white/[0.08] bg-transparent px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-white/20 focus:outline-none"
    />
  )
}
