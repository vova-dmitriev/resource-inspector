import { describe, expect, it, vi } from "vitest"
import { createPostgresConnector } from "../postgres.js"

const OperationalText = {
  BEGINREADONLY: "BEGIN READ ONLY",
  UnknownTable: "Unknown table",
} as const

describe("createPostgresConnector", () => {
  it("uses a read-only transaction and bounds table samples", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("information_schema.tables")) return { rows: [{ table_name: "orders" }] }
      if (sql.includes("information_schema.columns")) return { rows: [{ column_name: "id" }, { column_name: "email" }] }

      return { rows: [{ id: "order-1", email: "person@example.test" }] }
    })

    const client = {
      connect: vi.fn(async () => {}),
      query,
      end: vi.fn(async () => {}),
    }

    const connector = createPostgresConnector(
      {
        id: "database",
        type: "postgres",
        resources: [{ id: "db", name: "Database" }],
        options: { schema: "public" },
      },
      {
        connectionString: "postgresql://localhost/tickets",
        clientFactory: () => client,
      },
    )

    await expect(connector.inspect("db", "rows", { table: "orders", limit: 500 })).resolves.toEqual({
      rows: [{ id: "order-1", email: "[REDACTED]" }],
    })

    expect(query).toHaveBeenCalledWith(OperationalText.BEGINREADONLY)
    expect(query).toHaveBeenCalledWith('SELECT * FROM "public"."orders" LIMIT $1', [50])
    expect(query).toHaveBeenCalledWith("COMMIT")
  })

  it("rejects a table that is not in the configured schema", async () => {
    const client = {
      connect: vi.fn(async () => {}),
      query: vi.fn(async () => ({ rows: [] })),
      end: vi.fn(async () => {}),
    }

    const connector = createPostgresConnector(
      {
        id: "database",
        type: "postgres",
        resources: [{ id: "db", name: "Database" }],
        options: { schema: "public" },
      },
      {
        connectionString: "postgresql://localhost/tickets",
        clientFactory: () => client,
      },
    )

    await expect(
      connector.inspect("db", "rows", {
        table: 'orders"; DROP TABLE users;--',
      }),
    ).rejects.toThrow(OperationalText.UnknownTable)
  })
})
