import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router-dom"

import { App } from "./App"
import "./index.css"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
})

const rootEl = document.getElementById("root")
if (!rootEl) throw new Error("Missing #root")
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
