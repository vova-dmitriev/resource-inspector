import { describe, expect, it, vi } from "vitest"
import { createLokiConnector } from "../loki.js"

const OperationalText = {
  HTTPRequestCompleted: "HTTP request completed",
  ApplicationEvent: "Application event",
  Created: "created",
  SecretQuery: "secret query",
  LogServiceRequestFailed: "Log service request failed",
} as const
const LokiTestPolicy = { FailedHttpStatusCode: 500 } as const

describe("createLokiConnector", () => {
  it("returns bounded service logs and request history from the configured service", async () => {
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input))

      const values = url.searchParams.get("query")?.includes(OperationalText.HTTPRequestCompleted)
        ? [
            [
              "1",
              '{"msg":"HTTP request completed","requestId":"req-1","input":{"draftId":"d1","email":"person@example.test"},"output":{"status":"created"}}',
            ],
          ]
        : [["1", '{"msg":"Application event","detail":"started"}']]

      return Response.json({
        data: { resultType: "streams", result: [{ values }] },
      })
    })

    const connector = createLokiConnector(
      {
        id: "logs",
        type: "loki",
        resources: [{ id: "api", name: "API" }],
        options: { services: { api: "tickets-api" } },
      },
      { endpoint: "http://127.0.0.1:3100", fetcher },
    )

    await expect(connector.inspect("api", "logs")).resolves.toMatchObject({
      entries: [{ msg: OperationalText.ApplicationEvent }],
    })

    await expect(connector.inspect("api", "requests")).resolves.toMatchObject({
      entries: [
        {
          requestId: "req-1",
          input: { draftId: "d1", email: "[REDACTED]" },
          output: { status: OperationalText.Created },
        },
      ],
    })
  })

  it("does not return Loki's raw error body", async () => {
    const connector = createLokiConnector(
      {
        id: "logs",
        type: "loki",
        resources: [{ id: "api", name: "API" }],
        options: { services: { api: "tickets-api" } },
      },
      {
        endpoint: "http://127.0.0.1:3100",
        fetcher: async () =>
          new Response(OperationalText.SecretQuery, {
            status: LokiTestPolicy.FailedHttpStatusCode,
          }),
      },
    )

    await expect(connector.inspect("api", "logs")).rejects.toThrow(OperationalText.LogServiceRequestFailed)
  })
})
