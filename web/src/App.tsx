import { useQuery } from "@tanstack/react-query"
import { Navigate, Route, Routes } from "react-router-dom"

import { Shell } from "./components/Shell"
import { api } from "./lib/api"
import { ApiRefPage } from "./pages/ApiRef"
import { JobDetailPage } from "./pages/JobDetail"
import { JobsListPage } from "./pages/JobsList"
import { LoginPage } from "./pages/Login"
import { NewJobPage } from "./pages/NewJob"
import { RunDetailPage } from "./pages/RunDetail"

export function App() {
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.me().catch(() => null),
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="grid h-full place-items-center text-gray-400">
        loading…
      </div>
    )
  }

  if (!data) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    )
  }

  return (
    <Shell user={data.user}>
      <Routes>
        <Route path="/" element={<Navigate to="/jobs" replace />} />
        <Route path="/jobs" element={<JobsListPage />} />
        <Route path="/jobs/new" element={<NewJobPage />} />
        <Route path="/jobs/:id" element={<JobDetailPage />} />
        <Route path="/runs/:id" element={<RunDetailPage />} />
        <Route path="/api-ref" element={<ApiRefPage />} />
        <Route path="*" element={<Navigate to="/jobs" replace />} />
      </Routes>
    </Shell>
  )
}
