import { redact } from "../security/redaction.js"
import { Client, type QueryResultRow } from "pg"
import type { ConnectorConfiguration, ResourceConnector } from "../model/types.js"

const OperationalText = {
  BEGINREADONLY: "BEGIN READ ONLY",
  UnknownTable: "Unknown table",
  DatabaseInspectionFailed: "Database inspection failed",
  SELECT1: "SELECT 1",
  UnsupportedDatabaseView: "Unsupported database view",
  InvalidDatabaseSchema: "Invalid database schema",
  UnknownDatabaseResource: "Unknown database resource",
} as const

const PostgresPolicy = {
  TimeoutMs: 4_000,
  MaximumTables: 100,
  MaximumRows: 50,
} as const

type DatabaseClient = Readonly<{
  connect(): Promise<void>
  query<Row extends QueryResultRow = QueryResultRow>(query: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>
  end(): Promise<void>
}>

type PostgresOptions = Readonly<{
  connectionString: string
  clientFactory?: (connectionString: string) => DatabaseClient
}>

export function createPostgresConnector(
  configuration: ConnectorConfiguration,
  { connectionString, clientFactory = createClient }: PostgresOptions,
) {
  const schema = readSchema(configuration)
  const resources = configuration.resources.map((resource) => ({
    ...resource,
    views: ["status", "tables", "schema", "rows"],
  }))

  async function runReadOnly<T>(operation: (client: DatabaseClient) => Promise<T>): Promise<T> {
    const client = clientFactory(connectionString)

    await client.connect()

    try {
      await client.query(OperationalText.BEGINREADONLY)
      const result = await operation(client)

      await client.query("COMMIT")

      return result
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined)
      if (error instanceof Error && error.message === OperationalText.UnknownTable) throw error
      throw new Error(OperationalText.DatabaseInspectionFailed)
    } finally {
      await client.end().catch(() => undefined)
    }
  }

  async function checkStatus(resourceId: string) {
    requireResource(configuration, resourceId)

    try {
      await runReadOnly(async (client) => client.query(OperationalText.SELECT1))

      return { state: "running" as const, checkedAt: new Date().toISOString() }
    } catch {
      return {
        state: "unreachable" as const,
        checkedAt: new Date().toISOString(),
      }
    }
  }

  return {
    resources,
    status: checkStatus,
    async inspect(resourceId: string, view: string, input: Readonly<Record<string, unknown>> = {}) {
      requireResource(configuration, resourceId)
      if (view === "status") return checkStatus(resourceId)
      if (view === "tables") return runReadOnly(async (client) => readTables(client, schema))
      if (view === "schema") return runReadOnly(async (client) => readColumns(client, schema, input.table))

      if (view === "rows") {
        return runReadOnly(async (client) => {
          const table = requireTable(await readTables(client, schema), input.table)
          const requested = Number(input.limit ?? PostgresPolicy.MaximumRows)

          const limit = Math.max(
            1,
            Math.min(PostgresPolicy.MaximumRows, Math.floor(Number.isFinite(requested) ? requested : PostgresPolicy.MaximumRows)),
          )

          const rows = await client.query(`SELECT * FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)} LIMIT $1`, [limit])

          return { rows: rows.rows.map((row) => redact(row)) }
        })
      }

      throw new Error(OperationalText.UnsupportedDatabaseView)
    },
  } satisfies ResourceConnector
}

function createClient(connectionString: string) {
  return new Client({
    connectionString,
    connectionTimeoutMillis: PostgresPolicy.TimeoutMs,
    query_timeout: PostgresPolicy.TimeoutMs,
  }) as unknown as DatabaseClient
}

async function readTables(client: DatabaseClient, schema: string) {
  const result = await client.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name LIMIT $2",
    [schema, PostgresPolicy.MaximumTables],
  )

  return result.rows.map(({ table_name }) => table_name)
}

async function readColumns(client: DatabaseClient, schema: string, table: unknown) {
  const selected = requireTable(await readTables(client, schema), table)

  const result = await client.query<{ column_name: string; data_type: string }>(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position",
    [schema, selected],
  )

  return { table: selected, columns: result.rows }
}

function requireTable(tables: readonly string[], value: unknown) {
  if (typeof value !== "string" || !tables.includes(value)) throw new Error(OperationalText.UnknownTable)

  return value
}

function readSchema(configuration: ConnectorConfiguration) {
  const schema = configuration.options?.schema

  if (typeof schema !== "string" || !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(schema)) throw new Error(OperationalText.InvalidDatabaseSchema)

  return schema
}

function requireResource(configuration: ConnectorConfiguration, resourceId: string) {
  if (!configuration.resources.some(({ id }) => id === resourceId)) throw new Error(OperationalText.UnknownDatabaseResource)
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}
