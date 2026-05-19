import { PgClient } from "@effect/sql-pg"
import * as PgDrizzle from "drizzle-orm/effect-postgres"
import { Config, Context, type Effect, Layer } from "effect"

import * as schema from "./schema.ts"

const snakeToCamel = (s: string): string =>
  s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

const camelToSnake = (s: string): string =>
  s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase())

export const SqlLive = PgClient.layerConfig({
  url: Config.redacted("DATABASE_URL"),
  transformResultNames: Config.succeed(snakeToCamel),
  transformQueryNames: Config.succeed(camelToSnake),
})

const dbEff = PgDrizzle.makeWithDefaults({ schema })
type DbType = Effect.Effect.Success<typeof dbEff>

export class Db extends Context.Tag("Db")<Db, DbType>() {}

export const DbLive = Layer.effect(Db, dbEff)
