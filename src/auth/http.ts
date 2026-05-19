import { HttpApp } from "@effect/platform"

import { auth } from "./better-auth.ts"

export const betterAuthApp = HttpApp.fromWebHandler((req) =>
  auth.handler(req),
)
