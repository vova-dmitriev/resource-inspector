import { describe, expect, it } from "vitest"
import { createHttpHealthConnector } from "../http-health.js"

const OperationalText = {
  ConnectionRefused: "connection refused",
  HealthCheckFailed: "Health check failed",
} as const
const HealthTestPolicy = { SuccessfulStatusCode: 200 } as const

describe("createHttpHealthConnector", () => {
  it("distinguishes a responding process from an unreachable process", async () => {
    const connector = createHttpHealthConnector(
      {
        id: "processes",
        type: "http-health",
        resources: [{ id: "web", name: "Web" }],
        options: { targets: { web: "http://127.0.0.1:3000/" } },
      },
      async () => new Response("ok", { status: HealthTestPolicy.SuccessfulStatusCode }),
    )

    await expect(connector.status?.("web")).resolves.toMatchObject({
      state: "running",
    })
  })

  it("marks a failed health check unreachable without returning endpoint details", async () => {
    const connector = createHttpHealthConnector(
      {
        id: "processes",
        type: "http-health",
        resources: [{ id: "api", name: "API" }],
        options: {
          targets: { api: "http://127.0.0.1:4000/api/v1/health/live" },
        },
      },
      async () => {
        throw new Error(OperationalText.ConnectionRefused)
      },
    )

    await expect(connector.status?.("api")).resolves.toMatchObject({
      state: "unreachable",
      detail: OperationalText.HealthCheckFailed,
    })
  })
})
