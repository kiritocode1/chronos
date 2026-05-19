import { betterAuth } from "better-auth"
import { Pool } from "pg"

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required")
}

const secret = process.env.BETTER_AUTH_SECRET
if (!secret) {
  throw new Error("BETTER_AUTH_SECRET is required")
}

export const auth = betterAuth({
  database: new Pool({ connectionString: databaseUrl }),
  secret,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
})

export type Session = typeof auth.$Infer.Session
export type User = Session["user"]
