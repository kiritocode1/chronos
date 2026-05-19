import type { Config } from "drizzle-kit"

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for drizzle-kit")
}

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
  // Scope to tables we own. Better Auth owns user/session/account/verification;
  // @effect/cluster owns cluster_*. Drizzle must not touch those.
  tablesFilter: ["jobs", "job_runs", "notifications"],
} satisfies Config
